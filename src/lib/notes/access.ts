import { getNoteById } from "@/lib/dynamodb/entities/notes";
import {
  DEFAULT_SHARE_PERMISSIONS,
  FULL_NOTE_PERMISSIONS,
  getNoteAccessForUser,
} from "@/lib/dynamodb/entities/note-shares";
import type { DdbNote, DdbNoteShare, NotePermissions } from "@/lib/dynamodb/types";

export type NoteAccessRole = "owner" | "collaborator";

export interface ResolvedNoteAccess {
  note: DdbNote;
  role: NoteAccessRole;
  permissions: NotePermissions;
  share: DdbNoteShare | null;
}

/** Load a note for the caller if they own it or have an accepted share with read access. */
export async function resolveNoteAccess(
  userId: string,
  noteId: string
): Promise<ResolvedNoteAccess | null> {
  const owned = await getNoteById(userId, noteId);
  if (owned) {
    return {
      note: owned,
      role: "owner",
      permissions: FULL_NOTE_PERMISSIONS,
      share: null,
    };
  }

  const access = await getNoteAccessForUser(userId, noteId);
  if (!access || access.status !== "accepted" || !access.permissions?.canRead) {
    return null;
  }

  const note = await getNoteById(access.ownerId, noteId);
  if (!note) return null;

  return {
    note,
    role: "collaborator",
    permissions: {
      ...DEFAULT_SHARE_PERMISSIONS,
      ...access.permissions,
    },
    share: access,
  };
}

type NoteItemLike = { id: string; text: string; done: boolean };

function itemMap(items: NoteItemLike[] | undefined): Map<string, NoteItemLike> {
  const map = new Map<string, NoteItemLike>();
  for (const item of items || []) {
    if (item?.id) map.set(String(item.id), item);
  }
  return map;
}

/**
 * Validate a collaborator PUT against ACL.
 * Owner-only fields (pinned/archived/trashed/reminder) must not change for collaborators.
 */
export function assertCollaboratorUpdateAllowed(params: {
  existing: DdbNote;
  next: {
    title: string;
    text?: string;
    type: string;
    items: NoteItemLike[];
    color: string;
    pinned: boolean;
    archived: boolean;
    trashed: boolean;
    reminder?: string | null;
  };
  permissions: NotePermissions;
}): { ok: true } | { ok: false; error: string; status: number } {
  const { existing, next, permissions } = params;

  if (
    next.pinned !== existing.pinned ||
    next.archived !== existing.archived ||
    next.trashed !== existing.trashed ||
    (next.reminder ?? null) !== (existing.reminder ?? null)
  ) {
    return {
      ok: false,
      error: "Only the note owner can change pin, archive, trash, or reminder",
      status: 403,
    };
  }

  const prevItems = itemMap(existing.items as NoteItemLike[]);
  const nextItems = itemMap(next.items);
  const prevIds = new Set(prevItems.keys());
  const nextIds = new Set(nextItems.keys());

  const added: string[] = [];
  const removed: string[] = [];
  let itemsChanged = false;

  for (const id of nextIds) {
    if (!prevIds.has(id)) added.push(id);
    else {
      const a = prevItems.get(id)!;
      const b = nextItems.get(id)!;
      if (a.text !== b.text || Boolean(a.done) !== Boolean(b.done)) {
        itemsChanged = true;
      }
    }
  }
  for (const id of prevIds) {
    if (!nextIds.has(id)) removed.push(id);
  }

  const titleChanged = next.title !== existing.title;
  const textChanged = String(next.text || "") !== String(existing.text || "");
  const typeChanged = next.type !== existing.type;
  const colorChanged = next.color !== existing.color;

  if (added.length > 0 && !permissions.canCreate) {
    return { ok: false, error: "You do not have permission to add items", status: 403 };
  }
  if (removed.length > 0 && !permissions.canDelete) {
    return { ok: false, error: "You do not have permission to delete items", status: 403 };
  }

  const needsUpdate =
    titleChanged ||
    textChanged ||
    typeChanged ||
    colorChanged ||
    itemsChanged;

  // Creating new items alone is covered by canCreate; text append on text notes needs create or update
  if (textChanged && existing.type === "text" && !permissions.canUpdate) {
    // Allow append-only when canCreate (content grows, previous prefix preserved)
    const prevText = String(existing.text || "");
    const nextText = String(next.text || "");
    const isAppend = nextText.startsWith(prevText) && nextText.length > prevText.length;
    if (!(permissions.canCreate && isAppend)) {
      return { ok: false, error: "You do not have permission to edit this note", status: 403 };
    }
  } else if (needsUpdate && !permissions.canUpdate && added.length === 0) {
    // Item toggles / edits need update; pure adds are create-only
    if (itemsChanged || titleChanged || typeChanged || colorChanged) {
      return { ok: false, error: "You do not have permission to edit this note", status: 403 };
    }
  } else if (needsUpdate && !permissions.canUpdate && added.length > 0) {
    // Mixed: adds allowed, but other edits need update
    if (titleChanged || typeChanged || colorChanged || itemsChanged || (textChanged && existing.type !== "text")) {
      // itemsChanged true when existing items edited — block unless only adds
      const onlyAdds =
        !titleChanged &&
        !typeChanged &&
        !colorChanged &&
        !textChanged &&
        removed.length === 0 &&
        ![...prevIds].some((id) => {
          if (!nextIds.has(id)) return false;
          const a = prevItems.get(id)!;
          const b = nextItems.get(id)!;
          return a.text !== b.text || Boolean(a.done) !== Boolean(b.done);
        });
      if (!onlyAdds) {
        return { ok: false, error: "You do not have permission to edit this note", status: 403 };
      }
    }
  }

  return { ok: true };
}

export function serializeNoteForClient(
  note: DdbNote,
  extras?: {
    isOwner?: boolean;
    sharedBy?: { id: string; name: string } | null;
    permissions?: NotePermissions;
    shareStatus?: NoteShareStatusLike;
  }
) {
  return {
    ...note,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    items: note.items?.map((i) => ({ ...i })) || [],
    isOwner: extras?.isOwner ?? true,
    sharedBy: extras?.sharedBy ?? null,
    permissions: extras?.permissions ?? FULL_NOTE_PERMISSIONS,
    shareStatus: extras?.shareStatus,
  };
}

type NoteShareStatusLike = "pending" | "accepted" | "rejected";

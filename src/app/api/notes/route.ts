import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { listNotesForUser, putNote } from "@/lib/dynamodb/entities/notes";
import { getNoteById } from "@/lib/dynamodb/entities/notes";
import { listNoteAccessForUser } from "@/lib/dynamodb/entities/note-shares";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import { serializeNoteForClient } from "@/lib/notes/access";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const userId = auth.user.id;
    const [owned, accessRows] = await Promise.all([
      listNotesForUser(userId),
      listNoteAccessForUser(userId),
    ]);

    const accepted = accessRows.filter(
      (s) => s.status === "accepted" && s.permissions?.canRead !== false
    );

    const ownerIds = [...new Set(accepted.map((s) => s.ownerId))];
    const owners = ownerIds.length ? await getUsersByIds(ownerIds) : [];
    const ownerNameById = new Map(
      owners.map((u) => [u.id, u.name || u.email || "Someone"])
    );

    const sharedResolved = await Promise.all(
      accepted.map(async (share) => {
        const note = await getNoteById(share.ownerId, share.noteId);
        return note
          ? serializeNoteForClient(note, {
              isOwner: false,
              sharedBy: {
                id: share.ownerId,
                name: ownerNameById.get(share.ownerId) || share.invitedByName || "Someone",
              },
              permissions: share.permissions,
              shareStatus: share.status,
            })
          : null;
      })
    );

    const ownedSerialized = owned.map((n) =>
      serializeNoteForClient(n, { isOwner: true })
    );

    const byId = new Map<string, ReturnType<typeof serializeNoteForClient>>();
    for (const n of ownedSerialized) byId.set(n.id, n);
    for (const n of sharedResolved) {
      if (n && !byId.has(n.id)) byId.set(n.id, n);
    }

    const notes = [...byId.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ notes });
  } catch (error: any) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json().catch(() => ({}));
    const { title, text, type, items, color, pinned, archived, trashed, reminder } = body;
    const noteId = newAppId();
    const now = new Date().toISOString();

    const newNote = {
      id: noteId,
      userId: auth.user.id,
      title: String(title || "").trim(),
      text: String(text || "").trim(),
      type: (type === "text" ? "text" : "list") as "text" | "list",
      items: Array.isArray(items)
        ? items.map((i: any) => ({
            id: i.id || newAppId(),
            text: String(i.text || ""),
            done: Boolean(i.done),
            createdAt: i.createdAt || now,
            updatedAt: i.updatedAt || now,
          }))
        : [],
      color: String(color || ""),
      pinned: Boolean(pinned),
      archived: Boolean(archived),
      trashed: Boolean(trashed),
      reminder: reminder || null,
      created_at: now,
      updated_at: now,
    };

    await putNote(newNote);
    return NextResponse.json(
      { note: serializeNoteForClient(newNote as any, { isOwner: true }) },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}

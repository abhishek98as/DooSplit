import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId } from "@/lib/ids";
import { putNote, deleteNote } from "@/lib/dynamodb/entities/notes";
import { deleteAllSharesForNote } from "@/lib/dynamodb/entities/note-shares";
import { getUserById } from "@/lib/dynamodb/entities/users";
import {
  assertCollaboratorUpdateAllowed,
  resolveNoteAccess,
  serializeNoteForClient,
} from "@/lib/notes/access";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, text, type, items, color, pinned, archived, trashed, reminder } = body;

    const access = await resolveNoteAccess(auth.user.id, id);
    if (!access) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const existing = access.note;
    const now = new Date().toISOString();
    const next = {
      title: title !== undefined ? String(title).trim() : existing.title,
      text: text !== undefined ? String(text).trim() : existing.text,
      type: (type !== undefined
        ? type === "text"
          ? "text"
          : "list"
        : existing.type) as "text" | "list",
      items: Array.isArray(items)
        ? items.map((i: any) => ({
            id: i.id || newAppId(),
            text: String(i.text || ""),
            done: Boolean(i.done),
            createdAt: i.createdAt || now,
            updatedAt: i.updatedAt || now,
          }))
        : existing.items,
      color: color !== undefined ? String(color) : existing.color,
      pinned: pinned !== undefined ? Boolean(pinned) : existing.pinned,
      archived: archived !== undefined ? Boolean(archived) : existing.archived,
      trashed: trashed !== undefined ? Boolean(trashed) : existing.trashed,
      reminder: reminder !== undefined ? reminder || null : existing.reminder,
    };

    if (access.role === "collaborator") {
      const check = assertCollaboratorUpdateAllowed({
        existing,
        next,
        permissions: access.permissions,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: check.status });
      }
    }

    const updatedNote = {
      id: existing.id,
      userId: existing.userId,
      ...next,
      created_at: existing.created_at,
      updated_at: now,
    };

    await putNote(updatedNote);

    let sharedBy: { id: string; name: string } | null = null;
    if (access.role === "collaborator") {
      const owner = await getUserById(existing.userId);
      sharedBy = {
        id: existing.userId,
        name: owner?.name || access.share?.invitedByName || "Someone",
      };
    }

    return NextResponse.json({
      note: serializeNoteForClient(updatedNote as any, {
        isOwner: access.role === "owner",
        sharedBy,
        permissions: access.permissions,
        shareStatus: access.share?.status,
      }),
    });
  } catch (error: any) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id } = await params;
    const access = await resolveNoteAccess(auth.user.id, id);
    if (!access) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (access.role !== "owner") {
      return NextResponse.json(
        { error: "Only the note owner can permanently delete this note" },
        { status: 403 }
      );
    }

    await deleteAllSharesForNote(id);
    await deleteNote(auth.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

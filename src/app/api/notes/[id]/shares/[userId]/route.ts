import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getNoteById } from "@/lib/dynamodb/entities/notes";
import {
  DEFAULT_SHARE_PERMISSIONS,
  deleteNoteShare,
  getNoteShare,
  putNoteShare,
} from "@/lib/dynamodb/entities/note-shares";
import type { NotePermissions } from "@/lib/dynamodb/types";

export const dynamic = "force-dynamic";

function parsePermissions(body: any, fallback: NotePermissions): NotePermissions {
  return {
    canCreate:
      body.canCreate !== undefined ? Boolean(body.canCreate) : fallback.canCreate,
    canRead: body.canRead !== undefined ? Boolean(body.canRead) : fallback.canRead,
    canUpdate:
      body.canUpdate !== undefined ? Boolean(body.canUpdate) : fallback.canUpdate,
    canDelete:
      body.canDelete !== undefined ? Boolean(body.canDelete) : fallback.canDelete,
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id: noteId, userId: targetUserId } = await params;
    const note = await getNoteById(auth.user.id, noteId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const share = await getNoteShare(noteId, targetUserId);
    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const permissions = parsePermissions(
      body.permissions || body,
      share.permissions || DEFAULT_SHARE_PERMISSIONS
    );
    // Read is required for any collaborator access
    permissions.canRead = true;

    const updated = await putNoteShare({
      id: share.id,
      noteId: share.noteId,
      ownerId: share.ownerId,
      userId: share.userId,
      status: share.status,
      permissions,
      invitedByName: share.invitedByName,
      noteTitle: share.noteTitle,
      created_at: share.created_at,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      share: {
        id: updated.id,
        userId: updated.userId,
        status: updated.status,
        permissions: updated.permissions,
      },
    });
  } catch (error: any) {
    console.error("Update note share ACL error:", error);
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id: noteId, userId: targetUserId } = await params;
    const isOwner = Boolean(await getNoteById(auth.user.id, noteId));
    const isSelf = targetUserId === auth.user.id;

    if (!isOwner && !isSelf) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isOwner) {
      // ok
    } else {
      const share = await getNoteShare(noteId, auth.user.id);
      if (!share) {
        return NextResponse.json({ error: "Share not found" }, { status: 404 });
      }
    }

    await deleteNoteShare(noteId, targetUserId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Revoke note share error:", error);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}

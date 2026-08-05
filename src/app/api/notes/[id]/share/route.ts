import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId } from "@/lib/ids";
import { getNoteById } from "@/lib/dynamodb/entities/notes";
import {
  DEFAULT_SHARE_PERMISSIONS,
  getNoteShare,
  listSharesForNote,
  putNoteShare,
} from "@/lib/dynamodb/entities/note-shares";
import { getUsersByIds, getUserById } from "@/lib/dynamodb/entities/users";
import { getFriendshipStatus } from "@/lib/social/friendship-store";
import { notifyNoteShareInvite } from "@/lib/notificationService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id: noteId } = await params;
    const note = await getNoteById(auth.user.id, noteId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const shares = await listSharesForNote(noteId);
    const userIds = shares.map((s) => s.userId);
    const users = userIds.length ? await getUsersByIds(userIds) : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      shares: shares.map((s) => {
        const u = byId.get(s.userId);
        return {
          id: s.id,
          userId: s.userId,
          status: s.status,
          permissions: s.permissions,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          user: u
            ? {
                id: u.id,
                name: u.name,
                email: u.email,
                profilePicture: u.photo_url || null,
              }
            : { id: s.userId, name: "Unknown", email: "", profilePicture: null },
        };
      }),
    });
  } catch (error: any) {
    console.error("List note shares error:", error);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id: noteId } = await params;
    const note = await getNoteById(auth.user.id, noteId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const friendIds: string[] = Array.isArray(body.friendIds)
      ? body.friendIds.map((x: unknown) => String(x)).filter(Boolean)
      : [];

    if (friendIds.length === 0) {
      return NextResponse.json({ error: "Select at least one friend" }, { status: 400 });
    }

    const inviterName = auth.user.name || auth.user.email || "Someone";
    const now = new Date().toISOString();
    const invited: string[] = [];
    const skipped: Array<{ userId: string; reason: string }> = [];

    for (const friendId of [...new Set(friendIds)]) {
      if (friendId === auth.user.id) {
        skipped.push({ userId: friendId, reason: "cannot_share_with_self" });
        continue;
      }

      const target = await getUserById(friendId);
      if (!target || target.is_dummy) {
        skipped.push({ userId: friendId, reason: "invalid_user" });
        continue;
      }

      const friendship = await getFriendshipStatus(auth.user.id, friendId);
      if (friendship.status !== "accepted") {
        skipped.push({ userId: friendId, reason: "not_friends" });
        continue;
      }

      const existing = await getNoteShare(noteId, friendId);
      if (existing && (existing.status === "pending" || existing.status === "accepted")) {
        skipped.push({ userId: friendId, reason: "already_shared" });
        continue;
      }

      await putNoteShare({
        id: existing?.id || newAppId(),
        noteId,
        ownerId: auth.user.id,
        userId: friendId,
        status: "pending",
        permissions: { ...DEFAULT_SHARE_PERMISSIONS },
        invitedByName: inviterName,
        noteTitle: note.title || "Untitled note",
        created_at: existing?.created_at || now,
        updated_at: now,
      });

      await notifyNoteShareInvite({
        noteId,
        noteTitle: note.title || "Untitled note",
        invitedBy: { id: auth.user.id, name: inviterName },
        invitedUserId: friendId,
      });

      try {
        const { sendPushNotificationToUsers } = await import(
          "@/lib/firebase-messaging-admin"
        );
        await sendPushNotificationToUsers([friendId], {
          title: "Note invitation",
          body: `${inviterName} shared a note with you`,
          url: "/notes",
          data: {
            type: "note_share_invite",
            noteId,
            invitedByName: inviterName,
          },
        });
      } catch (pushErr) {
        console.warn("Note share push failed:", pushErr);
      }

      invited.push(friendId);
    }

    return NextResponse.json({ invited, skipped });
  } catch (error: any) {
    console.error("Share note error:", error);
    return NextResponse.json({ error: "Failed to share note" }, { status: 500 });
  }
}

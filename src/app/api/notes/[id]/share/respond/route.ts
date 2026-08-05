import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getNoteShare, putNoteShare, deleteNoteShare } from "@/lib/dynamodb/entities/note-shares";
import { createNotification } from "@/lib/notificationService";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const { id: noteId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action === "reject" ? "reject" : body.action === "accept" ? "accept" : null;
    if (!action) {
      return NextResponse.json({ error: "action must be accept or reject" }, { status: 400 });
    }

    const share = await getNoteShare(noteId, auth.user.id);
    if (!share || share.status !== "pending") {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "reject") {
      await deleteNoteShare(noteId, auth.user.id);
      return NextResponse.json({ success: true, status: "rejected" });
    }

    await putNoteShare({
      id: share.id,
      noteId: share.noteId,
      ownerId: share.ownerId,
      userId: share.userId,
      status: "accepted",
      permissions: share.permissions,
      invitedByName: share.invitedByName,
      noteTitle: share.noteTitle,
      created_at: share.created_at,
      updated_at: now,
    });

    try {
      const accepterName = auth.user.name || auth.user.email || "Someone";
      await createNotification({
        userId: share.ownerId,
        type: "note_share_accepted",
        message: `${accepterName} accepted your note invitation`,
        data: {
          noteId,
          noteTitle: share.noteTitle,
          acceptedById: auth.user.id,
          acceptedByName: accepterName,
        },
      });
    } catch (e) {
      console.warn("note_share_accepted notification failed:", e);
    }

    return NextResponse.json({ success: true, status: "accepted" });
  } catch (error: any) {
    console.error("Respond to note share error:", error);
    return NextResponse.json({ error: "Failed to respond to invitation" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { getUserById } from "@/lib/dynamodb/entities/users";
import { getInvitationById, updateInvitationStatus } from "@/lib/dynamodb/entities/invitations";

export const dynamic = "force-dynamic";

function normalizeInvitation(inv: any) {
  return {
    id: inv.id, _id: inv.id,
    invitedBy: inv.invited_by, invited_by: inv.invited_by,
    email: inv.email, email_normalized: inv.email_normalized || inv.email,
    token: inv.token,
    status: inv.status || "pending",
    createdAt: inv.created_at, created_at: inv.created_at,
    updatedAt: inv.updated_at, updated_at: inv.updated_at,
    expiresAt: inv.expires_at, expires_at: inv.expires_at,
  };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json();
    if (body?.action !== "resend") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    const invitation = await getInvitationById(id);
    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.invited_by !== auth.user.id) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.status === "accepted") return NextResponse.json({ error: "Already accepted" }, { status: 400 });
    if (invitation.status === "cancelled") return NextResponse.json({ error: "Already cancelled" }, { status: 400 });

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await updateInvitationStatus(id, "pending", newExpiresAt);

    const inviter = await getUserById(auth.user.id);
    const inviterName = inviter?.name || "A friend";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://doosplit.vercel.app";
    const inviteLink = `${appUrl}/invite/${invitation.token}`;

    try {
      await sendInviteEmail({ to: invitation.email, inviterName, inviteLink });
      return NextResponse.json({ message: "Invitation resent!", emailSent: true }, { status: 200 });
    } catch (emailError) {
      return NextResponse.json({ message: "Updated but email could not be sent", emailSent: false }, { status: 200 });
    }
  } catch (error: any) {
    console.error("Resend invitation error:", error);
    return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const invitation = await getInvitationById(id);
    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.invited_by !== auth.user.id) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.status === "accepted") return NextResponse.json({ error: "Cannot cancel accepted invitation" }, { status: 400 });

    await updateInvitationStatus(id, "cancelled");
    return NextResponse.json({ message: "Invitation cancelled" }, { status: 200 });
  } catch (error: any) {
    console.error("Cancel invitation error:", error);
    return NextResponse.json({ error: "Failed to cancel invitation" }, { status: 500 });
  }
}

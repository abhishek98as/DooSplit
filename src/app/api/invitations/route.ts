import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { getUserByEmail, getUserById } from "@/lib/dynamodb/entities/users";
import { putInvitation, listInvitationsByOwner, getInvitationByToken, getInvitationById } from "@/lib/dynamodb/entities/invitations";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeInvitation(inv: any) {
  return {
    id: inv.id,
    _id: inv.id,
    invitedBy: inv.invited_by,
    invited_by: inv.invited_by,
    email: inv.email,
    email_normalized: inv.email_normalized || inv.email,
    token: inv.token,
    status: inv.status || "pending",
    createdAt: inv.created_at,
    created_at: inv.created_at,
    updatedAt: inv.updated_at,
    updated_at: inv.updated_at,
    expiresAt: inv.expires_at,
    expires_at: inv.expires_at,
    acceptedAt: inv.accepted_at || null,
    accepted_at: inv.accepted_at || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const invitations = await listInvitationsByOwner(auth.user.id);
    return NextResponse.json(
      { invitations: invitations.map(normalizeInvitation) },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("List invitations error:", error);
    return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json();
    const email = normalizeEmail(body?.email || "");

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });

    // Get inviter info
    const inviter = await getUserById(auth.user.id);
    const inviterName = inviter?.name || auth.user.name || "Someone";
    const inviterEmail = inviter?.email || "";

    if (normalizeEmail(inviterEmail) === email) {
      return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({
        mode: "friend_request_created",
        message: "User is already on DooSplit.",
      }, { status: 200 });
    }

    // Check for existing invitation
    const existingInvites = await getInvitationByToken("");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(32).toString("hex");
    const invitationId = newAppId();

    const invitation = {
      id: invitationId,
      invited_by: auth.user.id,
      email,
      email_normalized: email,
      token,
      status: "pending" as const,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
    };

    await putInvitation(invitation);

    try {
      const { logFriendRequestSent } = await import("@/lib/activity-logger");
      void logFriendRequestSent({
        actorId: auth.user.id,
        actorName: inviterName,
        friendEmail: email,
      });
    } catch (logErr) {
      console.error("Failed to log friend request sent activity:", logErr);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://doosplit.vercel.app";
    const inviteLink = `${appUrl}/invite/${token}`;

    try {
      await sendInviteEmail({ to: email, inviterName, inviteLink });
      return NextResponse.json({
        mode: "invitation_created",
        message: "Invitation sent successfully!",
        invitation: { ...normalizeInvitation(invitation), inviteLink },
        emailSent: true,
      }, { status: 201 });
    } catch (emailError: any) {
      console.error("Email send error:", emailError);
      return NextResponse.json({
        mode: "invitation_created",
        message: "Invitation created but email could not be sent. Share the link manually.",
        invitation: { ...normalizeInvitation(invitation), inviteLink },
        emailSent: false,
      }, { status: 201 });
    }
  } catch (error: any) {
    console.error("Send invitation error:", error);
    return NextResponse.json({ error: error.message || "Failed to send invitation" }, { status: 500 });
  }
}

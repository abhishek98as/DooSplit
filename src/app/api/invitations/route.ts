import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { getUserByEmail, getUserById } from "@/lib/dynamodb/entities/users";
import { putInvitation, listInvitationsByOwner } from "@/lib/dynamodb/entities/invitations";
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
    groupId: inv.group_id || null,
    groupName: inv.group_name || null,
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
    const groupId = body?.groupId ? String(body.groupId).trim() : "";
    const groupName = body?.groupName ? String(body.groupName).trim() : "";

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });

    // Get inviter info
    const inviter = await getUserById(auth.user.id);
    const inviterName = inviter?.name || auth.user.name || "Someone";
    const inviterEmail = inviter?.email || "";

    if (normalizeEmail(inviterEmail) === email) {
      return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
    }

    let resolvedGroupName = groupName;
    if (groupId) {
      const { getGroupById, getGroupMember } = await import("@/lib/dynamodb/entities/groups");
      const membership = await getGroupMember(groupId, auth.user.id);
      if (!membership) {
        return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
      }
      const group = await getGroupById(groupId);
      if (!group || group.is_active === false) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      resolvedGroupName = resolvedGroupName || String(group.name || "");

      // If user already on DooSplit, add them to the group directly
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        const alreadyMember = await getGroupMember(groupId, existingUser.id);
        if (alreadyMember) {
          return NextResponse.json({
            mode: "already_member",
            message: "This person is already in the group.",
          });
        }
        const nowIso = new Date().toISOString();
        const { putGroupMember } = await import("@/lib/dynamodb/entities/groups");
        await putGroupMember({
          group_id: groupId,
          user_id: existingUser.id,
          role: "member",
          status: "active",
          joined_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        });
        return NextResponse.json({
          mode: "group_member_added",
          message: `${existingUser.name || email} was added to the group.`,
          userId: existingUser.id,
        });
      }
    }

    // Check if user already exists (friend invite path)
    const existingUser = await getUserByEmail(email);
    if (existingUser && !groupId) {
      return NextResponse.json({
        mode: "friend_request_created",
        message: "User is already on DooSplit.",
      }, { status: 200 });
    }

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
      ...(groupId
        ? { group_id: groupId, group_name: resolvedGroupName || undefined }
        : {}),
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

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof (value as any)?.toDate === "function") {
    return (value as any).toDate().toISOString();
  }
  return "";
}

function normalizeInvitation(invitation: any) {
  const id = String(invitation?.id || invitation?._id || "");
  const createdAt = toIso(invitation?.created_at || invitation?.createdAt);
  const updatedAt = toIso(invitation?.updated_at || invitation?.updatedAt);
  const expiresAt = toIso(invitation?.expires_at || invitation?.expiresAt);

  return {
    _id: id,
    id,
    invitedBy: String(invitation?.invited_by || invitation?.invitedBy || ""),
    invited_by: String(invitation?.invited_by || invitation?.invitedBy || ""),
    email: String(invitation?.email || ""),
    token: String(invitation?.token || ""),
    status: String(invitation?.status || "pending"),
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    expiresAt,
    expires_at: expiresAt,
    acceptedAt: toIso(invitation?.accepted_at || invitation?.acceptedAt),
    accepted_at: toIso(invitation?.accepted_at || invitation?.acceptedAt),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const supabase = requireSupabaseAdmin();
    const { data: invitations, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("invited_by", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { invitations: (invitations || []).map(normalizeInvitation) },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("List invitations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const email = String(body?.email || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: inviter, error: inviterError } = await supabase
      .from("users")
      .select("id,name,email")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (inviterError) {
      throw inviterError;
    }
    if (!inviter) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (String(inviter.email).toLowerCase() === email) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      );
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingUser?.id) {
      return NextResponse.json(
        {
          error:
            "This user is already registered on DooSplit. Send them a friend request instead!",
        },
        { status: 409 }
      );
    }

    const { data: latestInvitation } = await supabase
      .from("invitations")
      .select("*")
      .eq("invited_by", auth.user.id)
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestInvitation?.id) {
      if (String(latestInvitation.status || "") === "accepted") {
        return NextResponse.json(
          { error: "This invitation has already been accepted." },
          { status: 409 }
        );
      }

      const nowIso = new Date().toISOString();
      const refreshedExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const invitationToken = String(
        latestInvitation.token || crypto.randomBytes(32).toString("hex")
      );

      const { data: refreshedInvitation, error: refreshError } = await supabase
        .from("invitations")
        .update({
          status: "pending",
          token: invitationToken,
          expires_at: refreshedExpiresAt,
          updated_at: nowIso,
        })
        .eq("id", latestInvitation.id)
        .select("*")
        .maybeSingle();

      if (refreshError) {
        throw refreshError;
      }

      const invitationToSend = refreshedInvitation || {
        ...latestInvitation,
        status: "pending",
        token: invitationToken,
        expires_at: refreshedExpiresAt,
        updated_at: nowIso,
      };

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        "http://localhost:3000";
      const inviteLink = `${appUrl}/invite/${String(
        invitationToSend.token || invitationToken
      )}`;

      try {
        await sendInviteEmail({
          to: email,
          inviterName: inviter.name || "A friend",
          inviteLink,
        });
      } catch (emailError: any) {
        console.error("Email resend error:", emailError);
        return NextResponse.json(
          {
            message:
              "Invitation refreshed but email could not be sent. Share the link manually.",
            invitation: {
              ...normalizeInvitation(invitationToSend),
              inviteLink,
            },
            emailSent: false,
            reinvited: true,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          message: "Invitation resent successfully!",
          invitation: {
            ...normalizeInvitation(invitationToSend),
            inviteLink,
          },
          emailSent: true,
          reinvited: true,
        },
        { status: 200 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitationId = newAppId();

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({
        id: invitationId,
        invited_by: auth.user.id,
        email,
        token,
        status: "pending",
        created_at: nowIso,
        updated_at: nowIso,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (inviteError || !invitation) {
      throw inviteError || new Error("Failed to create invitation");
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${token}`;

    try {
      await sendInviteEmail({
        to: email,
        inviterName: inviter.name || "A friend",
        inviteLink,
      });
    } catch (emailError: any) {
      console.error("Email send error:", emailError);
      return NextResponse.json(
        {
          message:
            "Invitation created but email could not be sent. Share the link manually.",
          invitation: {
            ...normalizeInvitation(invitation),
            inviteLink,
          },
          emailSent: false,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        message: "Invitation sent successfully!",
        invitation: {
          ...normalizeInvitation(invitation),
          inviteLink,
        },
        emailSent: true,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Send invitation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send invitation" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({ invitations: invitations || [] }, { status: 200 });
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

    const { data: existingInvitation } = await supabase
      .from("invitations")
      .select("id")
      .eq("invited_by", auth.user.id)
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvitation?.id) {
      return NextResponse.json(
        { error: "You already have a pending invitation to this email" },
        { status: 409 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
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
            id: invitation.id,
            email: invitation.email,
            status: invitation.status,
            inviteLink,
            expiresAt: invitation.expires_at,
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
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          inviteLink,
          expiresAt: invitation.expires_at,
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


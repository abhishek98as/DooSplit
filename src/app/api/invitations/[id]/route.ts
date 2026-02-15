import { NextRequest, NextResponse } from "next/server";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const { action } = body || {};
    if (action !== "resend") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: invitation, error: invitationError } = await supabase
      .from("invitations")
      .select("*")
      .eq("id", id)
      .eq("invited_by", auth.user.id)
      .maybeSingle();

    if (invitationError) {
      throw invitationError;
    }
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 400 }
      );
    }
    if (invitation.status === "cancelled") {
      return NextResponse.json(
        { error: "This invitation has been cancelled" },
        { status: 400 }
      );
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", invitation.email)
      .maybeSingle();
    if (existingUser?.id) {
      await supabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.id);
      return NextResponse.json(
        { error: "This user has already registered" },
        { status: 400 }
      );
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const { data: updatedInvitation, error: updateError } = await supabase
      .from("invitations")
      .update({ expires_at: newExpiresAt, updated_at: nowIso })
      .eq("id", invitation.id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    const normalizedUpdatedInvitation = normalizeInvitation(
      updatedInvitation || { ...invitation, expires_at: newExpiresAt, updated_at: nowIso }
    );

    const { data: inviter } = await supabase
      .from("users")
      .select("name")
      .eq("id", auth.user.id)
      .maybeSingle();

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${invitation.token}`;

    try {
      await sendInviteEmail({
        to: invitation.email,
        inviterName: inviter?.name || "A friend",
        inviteLink,
      });

      return NextResponse.json(
        {
          message: "Invitation resent successfully!",
          invitation: normalizedUpdatedInvitation,
          emailSent: true,
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("Email send error:", emailError);
      return NextResponse.json(
        {
          message: "Invitation updated but email could not be sent",
          invitation: normalizedUpdatedInvitation,
          emailSent: false,
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error("Resend invitation error:", error);
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const supabase = requireSupabaseAdmin();
    const { data: invitation, error } = await supabase
      .from("invitations")
      .select("*")
      .eq("id", id)
      .eq("invited_by", auth.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cannot cancel an accepted invitation" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data: cancelledInvitation, error: cancelError } = await supabase
      .from("invitations")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("id", invitation.id)
      .select("*")
      .maybeSingle();

    if (cancelError) {
      throw cancelError;
    }

    return NextResponse.json(
      {
        message: "Invitation cancelled successfully",
        invitation: normalizeInvitation(
          cancelledInvitation || { ...invitation, status: "cancelled", updated_at: nowIso }
        ),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Cancel invitation error:", error);
    return NextResponse.json(
      { error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}

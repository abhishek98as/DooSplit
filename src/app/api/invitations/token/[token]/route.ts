import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = requireSupabaseAdmin();

    const { data: invitation, error } = await supabase
      .from("invitations")
      .select("id,email,invited_by,status,expires_at,token")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found", valid: false },
        { status: 404 }
      );
    }
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "This invitation has already been used", valid: false },
        { status: 410 }
      );
    }
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired", valid: false },
        { status: 410 }
      );
    }

    const { data: inviter } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .eq("id", invitation.invited_by)
      .maybeSingle();

    return NextResponse.json(
      {
        valid: true,
        invitation: {
          email: invitation.email,
          invitedBy: inviter
            ? {
                _id: inviter.id,
                name: inviter.name,
                email: inviter.email,
                profilePicture: inviter.profile_picture || null,
              }
            : null,
          expiresAt: invitation.expires_at,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Validate invitation error:", error);
    return NextResponse.json(
      { error: "Failed to validate invitation" },
      { status: 500 }
    );
  }
}


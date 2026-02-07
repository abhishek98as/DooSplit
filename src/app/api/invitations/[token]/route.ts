import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Invitation from "@/models/Invitation";

export const dynamic = "force-dynamic";

// GET /api/invitations/[token] - Validate an invitation token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    await dbConnect();

    const invitation = await Invitation.findOne({ token }).populate(
      "invitedBy",
      "name email profilePicture"
    );

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

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired", valid: false },
        { status: 410 }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        invitation: {
          email: invitation.email,
          invitedBy: invitation.invitedBy,
          expiresAt: invitation.expiresAt,
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

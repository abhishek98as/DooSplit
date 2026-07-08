import { NextRequest, NextResponse } from "next/server";
import { getInvitationByToken } from "@/lib/dynamodb/entities/invitations";
import { getUserById } from "@/lib/dynamodb/entities/users";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found", valid: false }, { status: 404 });
    }

    if (invitation.status === "accepted") {
      return NextResponse.json({ error: "Already used", valid: false }, { status: 410 });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: "Expired", valid: false }, { status: 410 });
    }

    let inviter = null;
    if (invitation.invited_by) {
      const user = await getUserById(invitation.invited_by);
      if (user) {
        inviter = { _id: user.id, name: user.name, email: user.email, profilePicture: null };
      }
    }

    return NextResponse.json({
      valid: true,
      invitation: {
        email: invitation.email,
        invitedBy: inviter,
        expiresAt: invitation.expires_at || null,
      },
    }, { status: 200 });
  } catch (error: any) {
    console.error("Validate invitation error:", error);
    return NextResponse.json({ error: "Failed to validate invitation" }, { status: 500 });
  }
}

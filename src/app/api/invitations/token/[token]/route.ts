import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getAdminDb();

    const inviteSnap = await db
      .collection("invitations")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (inviteSnap.empty) {
      return NextResponse.json(
        { error: "Invitation not found", valid: false },
        { status: 404 }
      );
    }

    const inviteDoc = inviteSnap.docs[0];
    const invitation = inviteDoc.data() || {};

    if (String(invitation.status || "") === "accepted") {
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

    const inviterId = String(invitation.invited_by || "");
    let inviter: any = null;
    if (inviterId) {
      const inviterDoc = await db.collection("users").doc(inviterId).get();
      if (inviterDoc.exists) {
        inviter = {
          id: inviterDoc.id,
          ...(inviterDoc.data() || {}),
        };
      }
    }

    return NextResponse.json(
      {
        valid: true,
        invitation: {
          email: String(invitation.email || ""),
          invitedBy: inviter
            ? {
                _id: inviter.id,
                name: inviter.name,
                email: inviter.email,
                profilePicture: inviter.profile_picture || null,
              }
            : null,
          expiresAt: invitation.expires_at || null,
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


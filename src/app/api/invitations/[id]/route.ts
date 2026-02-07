import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Invitation from "@/models/Invitation";
import { authOptions } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import User from "@/models/User";

// PUT /api/invitations/[id] - Resend invitation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action !== "resend") {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find invitation
    const invitation = await Invitation.findOne({
      _id: id,
      invitedBy: session.user.id,
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
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

    // Check if user already exists
    const existingUser = await User.findOne({ email: invitation.email });
    if (existingUser) {
      invitation.status = "accepted";
      await invitation.save();
      return NextResponse.json(
        { error: "This user has already registered" },
        { status: 400 }
      );
    }

    // Extend expiration date
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    invitation.expiresAt = newExpiresAt;
    await invitation.save();

    // Get inviter info
    const inviter = await User.findById(session.user.id);
    if (!inviter) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Build invite link
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${invitation.token}`;

    // Resend email
    try {
      await sendInviteEmail({
        to: invitation.email,
        inviterName: inviter.name || "A friend",
        inviteLink,
      });

      return NextResponse.json(
        {
          message: "Invitation resent successfully!",
          invitation: {
            id: invitation._id,
            email: invitation.email,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
          },
          emailSent: true,
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("Email send error:", emailError);
      return NextResponse.json(
        {
          message: "Invitation updated but email could not be sent",
          invitation: {
            id: invitation._id,
            email: invitation.email,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
          },
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

// DELETE /api/invitations/[id] - Cancel invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Find invitation
    const invitation = await Invitation.findOne({
      _id: id,
      invitedBy: session.user.id,
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cannot cancel an accepted invitation" },
        { status: 400 }
      );
    }

    // Mark as cancelled instead of deleting
    invitation.status = "cancelled";
    await invitation.save();

    return NextResponse.json(
      {
        message: "Invitation cancelled successfully",
        invitation: {
          id: invitation._id,
          email: invitation.email,
          status: invitation.status,
        },
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

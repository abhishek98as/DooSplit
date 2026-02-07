import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Invitation from "@/models/Invitation";
import { authOptions } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/invitations - List my sent invitations
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const invitations = await Invitation.find({
      invitedBy: session.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return NextResponse.json({ invitations }, { status: 200 });
  } catch (error: any) {
    console.error("List invitations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

// POST /api/invitations - Send an invitation email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email } = body;

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

    await dbConnect();

    // Check if user is inviting themselves
    const inviter = await User.findById(session.user.id);
    if (!inviter) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (inviter.email === email.toLowerCase()) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: "This user is already registered on DooSplit. Send them a friend request instead!" },
        { status: 409 }
      );
    }

    // Check if there's already a pending invitation from this user to this email
    const existingInvitation = await Invitation.findOne({
      invitedBy: session.user.id,
      email: email.toLowerCase(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: "You already have a pending invitation to this email" },
        { status: 409 }
      );
    }

    // Generate invite token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Save invitation
    const invitation = await Invitation.create({
      invitedBy: session.user.id,
      email: email.toLowerCase(),
      token,
      expiresAt,
    });

    // Build invite link
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${token}`;

    // Send email
    try {
      await sendInviteEmail({
        to: email,
        inviterName: inviter.name || "A friend",
        inviteLink,
      });
    } catch (emailError: any) {
      console.error("Email send error:", emailError);
      // Still return success — the invitation is created and the link is usable
      return NextResponse.json(
        {
          message: "Invitation created but email could not be sent. Share the link manually.",
          invitation: {
            id: invitation._id,
            email: invitation.email,
            status: invitation.status,
            inviteLink,
            expiresAt: invitation.expiresAt,
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
          id: invitation._id,
          email: invitation.email,
          status: invitation.status,
          inviteLink,
          expiresAt: invitation.expiresAt,
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

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Invitation from "@/models/Invitation";
import Friend from "@/models/Friend";
import { sendEmailVerification } from "@/lib/email";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = checkRateLimit(request, RATE_LIMITS.auth);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const body = await request.json();
    const { name, email, password, inviteToken } = body;

    // Validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
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

    // Check if user already exists (non-dummy)
    const existingUser = await User.findOne({ email: email.toLowerCase(), isDummy: { $ne: true } });
    if (existingUser) {
      // Determine which auth method to recommend based on existing account
      const loginMethod = existingUser.authProvider === "firebase" ? "Google" : "email/password";
      return NextResponse.json(
        {
          error: "An account with this email already exists",
          conflict: true,
          recommendedMethod: loginMethod,
          message: `This email is already registered with ${loginMethod} login. Please use ${loginMethod} to sign in instead.`
        },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      emailVerified: false,
      authProvider: "email",
      resetPasswordToken: verificationToken,
      resetPasswordExpires: verificationTokenExpires,
    });

    // Send email verification
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
      const verificationUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;

      await sendEmailVerification({
        to: user.email,
        userName: user.name,
        verificationUrl,
      });
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't fail registration if email fails
    }

    // Return user without password
    const responseData: any = {
      message: "User registered successfully. Please check your email to verify your account.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: false,
      },
      requiresEmailVerification: true,
    };

    // If registered via invitation, mark it accepted and auto-add as friends
    if (inviteToken) {
      try {
        const invitation = await Invitation.findOne({
          token: inviteToken,
          status: "pending",
          expiresAt: { $gt: new Date() },
        });

        if (invitation) {
          // Mark invitation as accepted
          invitation.status = "accepted";
          await invitation.save();

          const inviterId = invitation.invitedBy;
          const newUserId = user._id;

          // Create mutual friendship (already accepted)
          await Friend.insertMany([
            {
              userId: newUserId,
              friendId: inviterId,
              status: "accepted",
              requestedBy: inviterId,
            },
            {
              userId: inviterId,
              friendId: newUserId,
              status: "accepted",
              requestedBy: inviterId,
            },
          ]);

          responseData.friendAdded = true;
        }
      } catch (inviteErr) {
        console.error("Invite processing error (non-fatal):", inviteErr);
      }
    }

    // Merge any dummy users created by the inviter that match this email
    // Also check if any dummy user was created with the same name by the inviter
    try {
      if (inviteToken) {
        const invitation = await Invitation.findOne({ token: inviteToken });
        if (invitation) {
          // Find dummy users created by the inviter with matching name
          const dummyUsers = await User.find({
            isDummy: true,
            createdBy: invitation.invitedBy,
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
          });

          for (const dummy of dummyUsers) {
            // Transfer all friendships from dummy to real user
            await Friend.updateMany(
              { userId: dummy._id },
              { userId: user._id }
            );
            await Friend.updateMany(
              { friendId: dummy._id },
              { friendId: user._id }
            );

            // Transfer expense participants
            const ExpenseParticipant = mongoose.models.ExpenseParticipant;
            if (ExpenseParticipant) {
              await ExpenseParticipant.updateMany(
                { userId: dummy._id },
                { userId: user._id }
              );
            }

            // Delete the dummy user
            await User.deleteOne({ _id: dummy._id });
          }

          if (dummyUsers.length > 0) {
            responseData.dummyMerged = dummyUsers.length;
          }
        }
      }
    } catch (mergeErr) {
      console.error("Dummy merge error (non-fatal):", mergeErr);
    }

    return NextResponse.json(responseData, { status: 201 });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register user" },
      { status: 500 }
    );
  }
}


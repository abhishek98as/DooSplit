import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Invitation from "@/models/Invitation";
import Friend from "@/models/Friend";
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
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      emailVerified: false,
    });

    // Return user without password
    const responseData: any = {
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
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


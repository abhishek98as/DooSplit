import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import User from "@/models/User";

import { authOptions } from "@/lib/auth";
import { notifyFriendRequest } from "@/lib/notificationService";
import mongoose from "mongoose";
import { calculateBalanceBetweenUsers } from "@/lib/balanceCalculator";

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds timeout for Vercel serverless functions

// GET /api/friends - List all friends
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Friends API: Starting request");

    const session = await getServerSession(authOptions);
    console.log("🔍 Friends API: Session check", { hasSession: !!session, userId: session?.user?.id });

    if (!session?.user?.id) {
      console.log("❌ Friends API: Unauthorized - no session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🔍 Friends API: Connecting to database");
    await dbConnect();
    console.log("✅ Friends API: Database connected");

    const userId = new mongoose.Types.ObjectId(session.user.id);
    console.log("🔍 Friends API: User ID", userId.toString());

    // Find all accepted friendships
    console.log("🔍 Friends API: Querying friendships");
    const friendships = await Friend.find({
      $or: [{ userId }, { friendId: userId }],
      status: "accepted",
    }).populate("userId friendId", "name email profilePicture isDummy");
    console.log("✅ Friends API: Found friendships", friendships.length);

    // Extract friend data and calculate balances
    console.log("🔍 Friends API: Processing friendships");
    const friendPromises = friendships.map(async (friendship: any) => {
      try {
        const friendData =
          friendship.userId._id.toString() === session.user.id
            ? friendship.friendId
            : friendship.userId;

        console.log("🔍 Friends API: Calculating balance for", friendData.name);
        // Calculate balance including paid/owed amounts and settlements
        const balance = await calculateBalanceBetweenUsers(userId, friendData._id);

        return {
          id: friendship._id,
          friend: {
            id: friendData._id,
            name: friendData.name,
            email: friendData.email,
            profilePicture: friendData.profilePicture,
            isDummy: friendData.isDummy || false,
          },
          balance,
          friendshipDate: friendship.createdAt,
        };
      } catch (error: any) {
        console.error("❌ Friends API: Error processing friendship", friendship._id, error.message);
        return null;
      }
    });

    console.log("🔍 Friends API: Waiting for all promises");
    const allFriends = await Promise.all(friendPromises);
    console.log("✅ Friends API: All promises resolved", allFriends.length);

    // Filter out null results and deduplicate friends by friend ID (since each friendship creates two records)
    const validFriends = allFriends.filter(friend => friend !== null);
    console.log("🔍 Friends API: Valid friends after filtering", validFriends.length);

    const uniqueFriends = new Map();
    validFriends.forEach(friend => {
      const friendId = friend.friend.id.toString();
      if (!uniqueFriends.has(friendId)) {
        uniqueFriends.set(friendId, friend);
      }
    });

    const friendsWithBalances = Array.from(uniqueFriends.values());
    console.log("✅ Friends API: Final friends count", friendsWithBalances.length);

    return NextResponse.json({ friends: friendsWithBalances }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Friends API: Get friends error:", error);
    console.error("❌ Friends API: Error stack:", error.stack);
    return NextResponse.json(
      { error: "Failed to fetch friends", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/friends - Send friend request OR create dummy friend
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, userId: friendUserId, dummyName } = body;

    await dbConnect();

    const currentUserId = new mongoose.Types.ObjectId(session.user.id);

    // --- CREATE DUMMY FRIEND ---
    if (dummyName) {
      const trimmedName = dummyName.trim();
      if (!trimmedName || trimmedName.length < 1) {
        return NextResponse.json(
          { error: "Name is required for dummy friend" },
          { status: 400 }
        );
      }

      // Generate a unique placeholder email for the dummy user
      const dummyEmail = `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@placeholder.doosplit`;

      // Create the dummy user
      const dummyUser = await User.create({
        name: trimmedName,
        email: dummyEmail,
        password: "dummy_no_login",
        isDummy: true,
        createdBy: currentUserId,
        isActive: true,
      });

      // Auto-create accepted friendship
      await Friend.insertMany([
        {
          userId: currentUserId,
          friendId: dummyUser._id,
          status: "accepted",
          requestedBy: currentUserId,
        },
        {
          userId: dummyUser._id,
          friendId: currentUserId,
          status: "accepted",
          requestedBy: currentUserId,
        },
      ]);

      return NextResponse.json(
        {
          message: `Dummy friend "${trimmedName}" created successfully`,
          friendship: {
            friend: {
              id: dummyUser._id,
              name: dummyUser.name,
              email: dummyUser.email,
              isDummy: true,
            },
          },
        },
        { status: 201 }
      );
    }

    // --- SEND FRIEND REQUEST ---
    let friendUser;

    // Find friend by email or userId
    if (email) {
      friendUser = await User.findOne({ email: email.toLowerCase(), isDummy: { $ne: true } });
    } else if (friendUserId) {
      friendUser = await User.findById(friendUserId);
    }

    if (!friendUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (friendUser._id.toString() === session.user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend" },
        { status: 400 }
      );
    }

    // Check if friendship already exists
    const existingFriendship = await Friend.findOne({
      $or: [
        { userId: currentUserId, friendId: friendUser._id },
        { userId: friendUser._id, friendId: currentUserId },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === "accepted") {
        return NextResponse.json(
          { error: "Already friends" },
          { status: 400 }
        );
      } else if (existingFriendship.status === "pending") {
        return NextResponse.json(
          { error: "Friend request already sent" },
          { status: 400 }
        );
      }
    }

    // Create friend request (bidirectional)
    const friendship = await Friend.create({
      userId: currentUserId,
      friendId: friendUser._id,
      status: "pending",
      requestedBy: currentUserId,
    });

    // Create reverse entry
    await Friend.create({
      userId: friendUser._id,
      friendId: currentUserId,
      status: "pending",
      requestedBy: currentUserId,
    });

    // Send notification to the friend
    try {
      const currentUser = await User.findById(currentUserId).select("name");
      await notifyFriendRequest(
        { id: currentUserId, name: currentUser?.name || "Someone" },
        friendUser._id
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    return NextResponse.json(
      {
        message: "Friend request sent successfully",
        friendship: {
          id: friendship._id,
          friend: {
            id: friendUser._id,
            name: friendUser.name,
            email: friendUser.email,
          },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Send friend request error:", error);
    return NextResponse.json(
      { error: "Failed to send friend request" },
      { status: 500 }
    );
  }
}


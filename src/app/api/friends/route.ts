import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import User from "@/models/User";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// GET /api/friends - List all friends
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find all accepted friendships
    const friendships = await Friend.find({
      $or: [{ userId }, { friendId: userId }],
      status: "accepted",
    }).populate("userId friendId", "name email profilePicture");

    // Extract friend data and calculate balances
    const friendsWithBalances = await Promise.all(
      friendships.map(async (friendship: any) => {
        const friendData =
          friendship.userId._id.toString() === session.user.id
            ? friendship.friendId
            : friendship.userId;

        // Calculate balance (simplified - you'll enhance this with actual expense data)
const balance = await calculateBalance(userId, friendData._id);

        return {
          id: friendship._id,
          friend: {
            id: friendData._id,
            name: friendData.name,
            email: friendData.email,
            profilePicture: friendData.profilePicture,
          },
          balance,
          friendshipDate: friendship.createdAt,
        };
      })
    );

    return NextResponse.json({ friends: friendsWithBalances }, { status: 200 });
  } catch (error: any) {
    console.error("Get friends error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friends" },
      { status: 500 }
    );
  }
}

// POST /api/friends - Send friend request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, userId: friendUserId } = body;

    await dbConnect();

    const currentUserId = new mongoose.Types.ObjectId(session.user.id);
    let friendUser;

    // Find friend by email or userId
    if (email) {
      friendUser = await User.findOne({ email: email.toLowerCase() });
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

// Helper function to calculate balance
async function calculateBalance(
  userId: mongoose.Types.ObjectId,
  friendId: mongoose.Types.ObjectId
) {
  const participants = await ExpenseParticipant.find({
    userId: { $in: [userId, friendId] },
  }).populate({
    path: "expenseId",
    match: { isDeleted: false },
  });

  let balance = 0;

  const expenseMap = new Map();
  participants.forEach((p: any) => {
    if (!p.expenseId) return;
    const expenseId = p.expenseId._id.toString();
    if (!expenseMap.has(expenseId)) {
      expenseMap.set(expenseId, []);
    }
    expenseMap.get(expenseId).push(p);
  });

  expenseMap.forEach((parts) => {
    const userPart = parts.find(
      (p: any) => p.userId.toString() === userId.toString()
    );
    const friendPart = parts.find(
      (p: any) => p.userId.toString() === friendId.toString()
    );

    if (userPart && friendPart) {
      balance += userPart.paidAmount - userPart.owedAmount;
    }
  });

  return balance;
}

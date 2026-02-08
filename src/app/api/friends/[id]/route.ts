import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import User from "@/models/User";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

// GET /api/friends/[id] - Get friend details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find the friendship record
    const friendship = await Friend.findOne({
      $or: [
        { userId: session.user.id, friendId: id },
        { userId: id, friendId: session.user.id }
      ],
      status: "accepted"
    });

    if (!friendship) {
      return NextResponse.json(
        { error: "Friend not found" },
        { status: 404 }
      );
    }

    // Get friend details
    const friendId = friendship.userId.toString() === session.user.id
      ? friendship.friendId
      : friendship.userId;

    const friend = await User.findById(friendId).select(
      "name email profilePicture createdAt"
    );

    if (!friend) {
      return NextResponse.json(
        { error: "Friend not found" },
        { status: 404 }
      );
    }

    // Calculate balance between friends from expenses and settlements
    const ExpenseParticipant = (await import("@/models/ExpenseParticipant")).default;
    const Settlement = (await import("@/models/Settlement")).default;

    const friendObjectId = new mongoose.Types.ObjectId(friendId.toString());

    // Get all expenses where both users are participants
    const expenseParticipants = await ExpenseParticipant.find({
      userId: { $in: [userId, friendObjectId] }
    });

    const expenseIds = [...new Set(expenseParticipants.map(ep => ep.expenseId.toString()))];

    // Calculate balance from expenses
    let balance = 0;

    for (const expenseId of expenseIds) {
      const participants = expenseParticipants.filter(ep => ep.expenseId.toString() === expenseId);
      if (participants.length >= 2) { // Both users are in this expense
        const userParticipant = participants.find(p => p.userId.toString() === session.user.id);
        const friendParticipant = participants.find(p => p.userId.toString() === friendId.toString());

        if (userParticipant && friendParticipant) {
          balance += userParticipant.owedAmount;
        }
      }
    }

    // Subtract settlements
    const settlements = await Settlement.find({
      $or: [
        { fromUserId: userId, toUserId: friendObjectId },
        { fromUserId: friendObjectId, toUserId: userId }
      ]
    });

    settlements.forEach((settlement: any) => {
      if (settlement.fromUserId.toString() === session.user.id) {
        // User paid friend
        balance -= settlement.amount;
      } else {
        // Friend paid user
        balance += settlement.amount;
      }
    });

    return NextResponse.json({
      friend: {
        _id: friend._id,
        name: friend.name,
        email: friend.email,
        profilePicture: friend.profilePicture,
        balance: balance,
        friendsSince: friendship.createdAt
      }
    });
  } catch (error: any) {
    console.error("Friend details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend details" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    const activities: any[] = [];

    // Get recent expenses where user is involved (last 5)
    const participantRecords = await ExpenseParticipant.find({ userId }).select("expenseId");
    const expenseIds = participantRecords.map((p) => p.expenseId);

    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      isDeleted: false,
    })
      .populate("createdBy", "name profilePicture")
      .populate("groupId", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    expenses.forEach((expense: any) => {
      activities.push({
        id: expense._id,
        type: "expense_added",
        description: `${expense.createdBy.name} added "${expense.description}"`,
        amount: expense.amount,
        currency: expense.currency,
        createdAt: expense.createdAt,
        user: {
          id: expense.createdBy._id,
          name: expense.createdBy.name,
          profilePicture: expense.createdBy.profilePicture
        },
        group: expense.groupId ? {
          id: expense.groupId._id,
          name: expense.groupId.name
        } : null
      });
    });

    // Get recent settlements where user is involved (last 5)
    const settlements = await Settlement.find({
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    })
      .populate("fromUserId", "name profilePicture")
      .populate("toUserId", "name profilePicture")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    settlements.forEach((settlement: any) => {
      const isFromUser = settlement.fromUserId._id.toString() === session.user.id;
      const otherUser = isFromUser ? settlement.toUserId : settlement.fromUserId;
      const action = isFromUser ? "paid" : "received payment from";

      activities.push({
        id: settlement._id,
        type: "settlement",
        description: `You ${action} ${otherUser.name}`,
        amount: settlement.amount,
        currency: settlement.currency,
        createdAt: settlement.createdAt,
        user: {
          id: otherUser._id,
          name: otherUser.name,
          profilePicture: otherUser.profilePicture
        }
      });
    });

    // Get recent friend activities (last 3)
    const friends = await Friend.find({
      $or: [{ userId }, { friendId: userId }],
      status: "accepted"
    })
      .populate("userId", "name profilePicture")
      .populate("friendId", "name profilePicture")
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    friends.forEach((friend: any) => {
      const otherUser = friend.userId._id.toString() === session.user.id ? friend.friendId : friend.userId;
      activities.push({
        id: friend._id,
        type: "friend_added",
        description: `You became friends with ${otherUser.name}`,
        createdAt: friend.createdAt,
        user: {
          id: otherUser._id,
          name: otherUser.name,
          profilePicture: otherUser.profilePicture
        }
      });
    });

    // Sort all activities by createdAt and take the most recent 15
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const recentActivities = activities.slice(0, 15);

    return NextResponse.json({
      activities: recentActivities
    });
  } catch (error: any) {
    console.error("Dashboard activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard activities" },
      { status: 500 }
    );
  }
}
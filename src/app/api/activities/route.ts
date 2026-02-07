import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

// GET /api/activities - Get activity feed
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Get expenses where user is involved
    const participantRecords = await ExpenseParticipant.find({ userId }).select(
      "expenseId"
    );
    const expenseIds = participantRecords.map((p) => p.expenseId);

    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      isDeleted: false,
    })
      .populate("createdBy", "name email profilePicture")
      .populate("groupId", "name image")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get settlements where user is involved
    const settlements = await Settlement.find({
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    })
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .populate("groupId", "name image")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get friend requests
    const friendRequests = await Friend.find({
      $or: [
        { userId: userId, status: "pending" },
        { friendId: userId, status: "pending" },
      ],
    })
      .populate("userId", "name email profilePicture")
      .populate("friendId", "name email profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    // Combine and sort all activities
    const activities: any[] = [];

    // Add expenses
    for (const expense of expenses) {
      const participants = await ExpenseParticipant.find({
        expenseId: expense._id,
      }).populate("userId", "name email profilePicture");

      activities.push({
        type: "expense",
        id: expense._id,
        timestamp: expense.createdAt,
        data: {
          ...expense,
          participants,
        },
      });
    }

    // Add settlements
    for (const settlement of settlements) {
      activities.push({
        type: "settlement",
        id: settlement._id,
        timestamp: settlement.createdAt,
        data: settlement,
      });
    }

    // Add friend requests
    for (const request of friendRequests) {
      activities.push({
        type: "friend_request",
        id: request._id,
        timestamp: request.createdAt,
        data: request,
      });
    }

    // Sort by timestamp descending
    activities.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Paginate
    const skip = (page - 1) * limit;
    const paginatedActivities = activities.slice(skip, skip + limit);

    return NextResponse.json(
      {
        activities: paginatedActivities,
        pagination: {
          page,
          limit,
          total: activities.length,
          totalPages: Math.ceil(activities.length / limit),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}


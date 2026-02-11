import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/activities - Get activity feed
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    const userId = new mongoose.Types.ObjectId(session.user.id);
    const fetchLimit = Math.min(200, page * limit + limit);
    const cacheKey = buildUserScopedCacheKey(
      "activities",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.activities,
      async () => {
      await dbConnect();
      // Get expenses where user is involved
      const expenseIds = await ExpenseParticipant.find({ userId }).distinct("expenseId");

      const expenses = await Expense.find({
        _id: { $in: expenseIds },
        isDeleted: false,
      })
        .populate("createdBy", "name email profilePicture")
        .populate("groupId", "name image")
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();

      // Fetch all expense participants in one query (avoid N+1).
      const participants = await ExpenseParticipant.find({
        expenseId: { $in: expenses.map((expense) => expense._id) },
      })
        .populate("userId", "name email profilePicture")
        .lean();

      const participantsByExpense = new Map<string, any[]>();
      for (const participant of participants) {
        const key = participant.expenseId.toString();
        const list = participantsByExpense.get(key) || [];
        list.push(participant);
        participantsByExpense.set(key, list);
      }

      // Get settlements where user is involved
      const settlements = await Settlement.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
      })
        .populate("fromUserId", "name email profilePicture")
        .populate("toUserId", "name email profilePicture")
        .populate("groupId", "name image")
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
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
        .limit(fetchLimit)
        .lean();

      // Combine and sort all activities
      const activities: any[] = [];

      for (const expense of expenses) {
        activities.push({
          type: "expense",
          id: expense._id,
          timestamp: expense.createdAt,
          data: {
            ...expense,
            participants: participantsByExpense.get(expense._id.toString()) || [],
          },
        });
      }

      for (const settlement of settlements) {
        activities.push({
          type: "settlement",
          id: settlement._id,
          timestamp: settlement.createdAt,
          data: settlement,
        });
      }

      for (const friendRequest of friendRequests) {
        activities.push({
          type: "friend_request",
          id: friendRequest._id,
          timestamp: friendRequest.createdAt,
          data: friendRequest,
        });
      }

      activities.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Paginate after merge.
      const skip = (page - 1) * limit;
      const paginatedActivities = activities.slice(skip, skip + limit);

      return {
        activities: paginatedActivities,
        pagination: {
          page,
          limit,
          total: activities.length,
          totalPages: Math.ceil(activities.length / limit),
        },
      };
    }
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Cache": cacheStatus,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
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

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);
    const cacheKey = buildUserScopedCacheKey(
      "dashboard-activity",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.dashboardActivity,
      async () => {
        await dbConnect();
        const activities: any[] = [];

        // Get recent expenses where user is involved (last 12)
        const expenseIds = await ExpenseParticipant.find({ userId }).distinct("expenseId");

        const expenses = await Expense.find({
          _id: { $in: expenseIds },
          isDeleted: false,
        })
          .populate("createdBy", "name profilePicture")
          .populate("groupId", "name")
          .sort({ createdAt: -1 })
          .limit(12)
          .lean();

        expenses.forEach((expense: any) => {
          const expenseType = expense.groupId ? "group" : "non-group";

          activities.push({
            id: expense._id,
            type: "expense_added",
            expenseType,
            description: expense.groupId
              ? `${expense.createdBy.name} added "${expense.description}" in ${expense.groupId.name}`
              : `${expense.createdBy.name} added "${expense.description}" with friends`,
            amount: expense.amount,
            currency: expense.currency,
            createdAt: expense.createdAt,
            user: {
              id: expense.createdBy._id,
              name: expense.createdBy.name,
              profilePicture: expense.createdBy.profilePicture,
            },
            group: expense.groupId
              ? {
                  id: expense.groupId._id,
                  name: expense.groupId.name,
                }
              : null,
          });
        });

        // Get recent settlements where user is involved (last 8)
        const settlements = await Settlement.find({
          $or: [{ fromUserId: userId }, { toUserId: userId }],
        })
          .populate("fromUserId", "name profilePicture")
          .populate("toUserId", "name profilePicture")
          .sort({ createdAt: -1 })
          .limit(8)
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
              profilePicture: otherUser.profilePicture,
            },
          });
        });

        // Get recent friend activities (last 3)
        const friends = await Friend.find({
          $or: [{ userId }, { friendId: userId }],
          status: "accepted",
        })
          .populate("userId", "name profilePicture")
          .populate("friendId", "name profilePicture")
          .sort({ createdAt: -1 })
          .limit(3)
          .lean();

        friends.forEach((friend: any) => {
          const otherUser =
            friend.userId._id.toString() === session.user.id
              ? friend.friendId
              : friend.userId;

          activities.push({
            id: friend._id,
            type: "friend_added",
            description: `You became friends with ${otherUser.name}`,
            createdAt: friend.createdAt,
            user: {
              id: otherUser._id,
              name: otherUser.name,
              profilePicture: otherUser.profilePicture,
            },
          });
        });

        // Sort all activities by createdAt and take the most recent 20
        activities.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return {
          activities: activities.slice(0, 20),
        };
      }
    );

    return NextResponse.json(payload, {
      headers: {
        "X-Doosplit-Cache": cacheStatus,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Dashboard activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard activities" },
      { status: 500 }
    );
  }
}

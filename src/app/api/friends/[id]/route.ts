import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import User from "@/models/User";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import GroupMember from "@/models/GroupMember";
import Group from "@/models/Group";
import { authOptions } from "@/lib/auth";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/friends/[id] - Get friend details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find the friendship record
    const friendship = await Friend.findOne({
      $or: [
        { userId: session.user.id, friendId: id },
        { userId: id, friendId: session.user.id },
      ],
      status: "accepted",
    }).lean();

    if (!friendship) {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const friendId =
      friendship.userId.toString() === session.user.id
        ? friendship.friendId.toString()
        : friendship.userId.toString();

    const cacheKey = buildUserScopedCacheKey(
      "friend-details",
      session.user.id,
      `${friendId}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      // Get friend details
      const friend = await User.findById(friendId).select(
        "name email profilePicture createdAt"
      );

      if (!friend) {
        throw new Error("Friend not found");
      }

      const friendObjectId = new mongoose.Types.ObjectId(friendId);

      // Get all expenses where both users are participants.
      const pairParticipants = await ExpenseParticipant.find({
        userId: { $in: [userId, friendObjectId] },
      })
        .select("expenseId userId paidAmount owedAmount")
        .lean();

      const pairByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants) {
        const key = participant.expenseId.toString();
        const list = pairByExpense.get(key) || [];
        list.push(participant);
        pairByExpense.set(key, list);
      }

      // Calculate balance from expenses.
      let balance = 0;
      for (const participants of pairByExpense.values()) {
        if (participants.length < 2) {
          continue;
        }

        const friendParticipant = participants.find(
          (participant) => participant.userId.toString() === friendId
        );

        if (!friendParticipant) {
          continue;
        }

        const friendNetPosition =
          friendParticipant.paidAmount - friendParticipant.owedAmount;
        balance -= friendNetPosition;
      }

      // Subtract settlements.
      const settlements = await Settlement.find({
        $or: [
          { fromUserId: userId, toUserId: friendObjectId },
          { fromUserId: friendObjectId, toUserId: userId },
        ],
      })
        .select("fromUserId toUserId amount")
        .lean();

      settlements.forEach((settlement: any) => {
        if (settlement.fromUserId.toString() === session.user.id) {
          balance -= settlement.amount;
        } else {
          balance += settlement.amount;
        }
      });

      // Get group breakdown.
      const [userGroupIds, friendGroupIds] = await Promise.all([
        GroupMember.find({ userId }).distinct("groupId"),
        GroupMember.find({ userId: friendObjectId }).distinct("groupId"),
      ]);

      const friendGroupSet = new Set(friendGroupIds.map((groupId: any) => groupId.toString()));
      const commonGroupIds = userGroupIds
        .map((groupId: any) => groupId.toString())
        .filter((groupId) => friendGroupSet.has(groupId));

      let groupBreakdown: Array<{
        groupId: mongoose.Types.ObjectId;
        groupName: string;
        balance: number;
        lastActivity: Date | null;
      }> = [];

      if (commonGroupIds.length > 0) {
        const commonGroupObjectIds = commonGroupIds.map(
          (groupId) => new mongoose.Types.ObjectId(groupId)
        );

        const [groups, groupExpenses] = await Promise.all([
          Group.find({ _id: { $in: commonGroupObjectIds } }).select("name").lean(),
          Expense.find({
            groupId: { $in: commonGroupObjectIds },
            isDeleted: false,
          })
            .select("_id groupId createdBy updatedAt")
            .lean(),
        ]);

        const expenseParticipants = await ExpenseParticipant.find({
          expenseId: { $in: groupExpenses.map((expense) => expense._id) },
        })
          .select("expenseId userId owedAmount")
          .lean();

        const participantsByExpense = new Map<string, any[]>();
        for (const participant of expenseParticipants) {
          const key = participant.expenseId.toString();
          const list = participantsByExpense.get(key) || [];
          list.push(participant);
          participantsByExpense.set(key, list);
        }

        const expensesByGroup = new Map<string, any[]>();
        for (const expense of groupExpenses) {
          if (!expense.groupId) {
            continue;
          }
          const key = expense.groupId.toString();
          const list = expensesByGroup.get(key) || [];
          list.push(expense);
          expensesByGroup.set(key, list);
        }

        groupBreakdown = groups.map((group) => {
          const expenses = expensesByGroup.get(group._id.toString()) || [];

          let groupBalance = 0;
          let lastActivity: Date | null = null;

          for (const expense of expenses) {
            const participants = participantsByExpense.get(expense._id.toString()) || [];
            const userParticipant = participants.find(
              (participant: any) => participant.userId.toString() === session.user.id
            );
            const friendParticipant = participants.find(
              (participant: any) => participant.userId.toString() === friendId
            );

            if (userParticipant && friendParticipant) {
              groupBalance += userParticipant.owedAmount;
            }

            const isUserOrFriendExpense =
              expense.createdBy.toString() === session.user.id ||
              expense.createdBy.toString() === friendId;

            if (isUserOrFriendExpense) {
              if (!lastActivity || expense.updatedAt > lastActivity) {
                lastActivity = expense.updatedAt;
              }
            }
          }

          return {
            groupId: group._id,
            groupName: group.name,
            balance: Math.round(groupBalance * 100) / 100,
            lastActivity,
          };
        });
      }

      return {
        friend: {
          _id: friend._id,
          name: friend.name,
          email: friend.email,
          profilePicture: friend.profilePicture,
          balance,
          friendsSince: friendship.createdAt,
        },
        groupBreakdown,
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    if (error.message === "Friend not found") {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    console.error("Friend details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend details" },
      { status: 500 }
    );
  }
}

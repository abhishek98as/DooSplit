import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";

export const dynamic = "force-dynamic";

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
    const friendId = new mongoose.Types.ObjectId(id);

    // Verify friendship exists
    const Friend = (await import("@/models/Friend")).default;
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

    const cacheKey = buildUserScopedCacheKey(
      "friend-transactions",
      session.user.id,
      `${id}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      const transactions: any[] = [];

      // Get expense participations for both users.
      const pairParticipants = await ExpenseParticipant.find({
        userId: { $in: [userId, friendId] },
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

      const expenseIds = Array.from(pairByExpense.entries())
        .filter(([, participants]) => participants.length >= 2)
        .map(([expenseId]) => new mongoose.Types.ObjectId(expenseId));

      if (expenseIds.length > 0) {
        const expenses = await Expense.find({
          _id: { $in: expenseIds },
          isDeleted: false,
        })
          .populate("createdBy", "name profilePicture")
          .populate("groupId", "name")
          .lean();

        const allParticipants = await ExpenseParticipant.find({
          expenseId: { $in: expenseIds },
        })
          .select("expenseId isSettled")
          .lean();

        const settledByExpense = new Map<string, boolean>();
        for (const participant of allParticipants) {
          const key = participant.expenseId.toString();
          if (!settledByExpense.has(key)) {
            settledByExpense.set(key, true);
          }
          if (!participant.isSettled) {
            settledByExpense.set(key, false);
          }
        }

        for (const expense of expenses as any[]) {
          const participants = pairByExpense.get(expense._id.toString()) || [];
          const userParticipant = participants.find(
            (p) => p.userId.toString() === session.user.id
          );

          if (!userParticipant) {
            continue;
          }

          const netAmount = userParticipant.owedAmount;
          const isPositive = userParticipant.paidAmount > userParticipant.owedAmount;

          transactions.push({
            id: expense._id,
            type: "expense",
            description: expense.description,
            amount: Math.abs(netAmount),
            currency: expense.currency,
            createdAt: expense.createdAt,
            isSettlement: false,
            settled: settledByExpense.get(expense._id.toString()) ?? false,
            group: expense.groupId
              ? {
                  id: (expense.groupId as any)._id,
                  name: (expense.groupId as any).name,
                }
              : null,
            isPositive,
            user: {
              id: (expense.createdBy as any)._id,
              name: (expense.createdBy as any).name,
              profilePicture: (expense.createdBy as any).profilePicture,
            },
          });
        }
      }

      // Get settlements between these two users.
      const settlements = await Settlement.find({
        $or: [
          { fromUserId: userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: userId },
        ],
      })
        .populate("fromUserId", "name profilePicture")
        .populate("toUserId", "name profilePicture")
        .sort({ createdAt: -1 })
        .lean();

      settlements.forEach((settlement: any) => {
        const isFromUser = settlement.fromUserId._id.toString() === session.user.id;
        const otherUser = isFromUser ? settlement.toUserId : settlement.fromUserId;
        const action = isFromUser ? "paid" : "received payment from";

        transactions.push({
          id: settlement._id,
          type: "settlement",
          description: `You ${action} ${otherUser.name}`,
          amount: settlement.amount,
          currency: settlement.currency,
          createdAt: settlement.createdAt,
          isSettlement: true,
          settled: true,
          user: {
            id: otherUser._id,
            name: otherUser.name,
            profilePicture: otherUser.profilePicture,
          },
        });
      });

      transactions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        transactions,
        count: transactions.length,
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Get friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

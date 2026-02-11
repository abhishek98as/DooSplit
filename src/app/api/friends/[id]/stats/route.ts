import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";

export const dynamic = 'force-dynamic';

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
    const friendId = new mongoose.Types.ObjectId(id);

    // Verify friendship exists
    const Friend = (await import("@/models/Friend")).default;
    const friendship = await Friend.findOne({
      $or: [
        { userId: session.user.id, friendId: id },
        { userId: id, friendId: session.user.id }
      ],
      status: "accepted"
    }).lean();

    if (!friendship) {
      return NextResponse.json(
        { error: "Friend not found" },
        { status: 404 }
      );
    }

    const cacheKey = buildUserScopedCacheKey(
      "friend-details",
      session.user.id,
      `stats:${id}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      // Get expense statistics
      const expenseParticipants = await ExpenseParticipant.find({
        userId: { $in: [userId, friendId] }
      }).lean();

      const expenseIds = [...new Set(expenseParticipants.map(ep => ep.expenseId.toString()))];

      // Get all expenses with this friend
      const expenses = await Expense.find({
        _id: { $in: expenseIds },
        isDeleted: false
      }).sort({ date: 1 }).lean();

      // Calculate statistics
      const categoryStats: { [key: string]: number } = {};
      const monthlyStats: { [key: string]: number } = {};
      let totalExpenses = 0;
      let totalSettlements = 0;

      for (const expense of expenses) {
        const participants = expenseParticipants.filter(ep => ep.expenseId.toString() === expense._id.toString());
        const userParticipant = participants.find(p => p.userId.toString() === session.user.id);
        const friendParticipant = participants.find(p => p.userId.toString() === friendId.toString());

        if (userParticipant && friendParticipant) {
          const userShare = userParticipant.owedAmount;
          categoryStats[expense.category] = (categoryStats[expense.category] || 0) + userShare;
          totalExpenses += userShare;
          const monthKey = new Date(expense.date).toISOString().substring(0, 7);
          monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + userShare;
        }
      }

      // Get settlements
      const Settlement = (await import("@/models/Settlement")).default;
      const settlements = await Settlement.find({
        $or: [
          { fromUserId: userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: userId }
        ]
      }).lean();

      settlements.forEach((settlement: any) => {
        const isFromUser = settlement.fromUserId.toString() === session.user.id;
        totalSettlements += isFromUser ? settlement.amount : -settlement.amount;
      });

      const categoryChartData = Object.entries(categoryStats).map(([category, amount]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        amount: Math.round(amount * 100) / 100,
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
      }));

      const monthlyChartData = Object.entries(monthlyStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({
          month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          amount: Math.round(amount * 100) / 100
        }));

      return {
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalSettlements: Math.round(totalSettlements * 100) / 100,
        netBalance: Math.round((totalExpenses - totalSettlements) * 100) / 100,
        categoryBreakdown: categoryChartData,
        monthlyTrend: monthlyChartData,
        expenseCount: expenses.length,
        settlementCount: settlements.length
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Get friend stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
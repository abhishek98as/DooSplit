import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// GET /api/analytics - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const timeframe = searchParams.get("timeframe") || "month"; // month, quarter, year, all

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Get user's expenses
    const participantRecords = await ExpenseParticipant.find({ userId });
    const expenseIds = participantRecords.map((p) => p.expenseId);

    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      isDeleted: false,
      date: { $gte: startDate },
    }).lean();

    // Category breakdown
    const categoryData = expenses.reduce((acc: any, expense: any) => {
      const category = expense.category || "other";
      if (!acc[category]) {
        acc[category] = { count: 0, total: 0 };
      }
      acc[category].count += 1;
      acc[category].total += expense.amount;
      return acc;
    }, {});

    const categoryBreakdown = Object.keys(categoryData).map((category) => ({
      category,
      count: categoryData[category].count,
      total: categoryData[category].total,
    }));

    // Monthly trend (last 6 months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthExpenses = expenses.filter((e: any) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      });

      const monthParticipants = await ExpenseParticipant.find({
        userId,
        expenseId: { $in: monthExpenses.map((e: any) => e._id) },
      });

      const totalSpent = monthParticipants.reduce(
        (sum, p) => sum + p.owedAmount,
        0
      );

      monthlyData.push({
        month: monthStart.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        expenses: monthExpenses.length,
        total: totalSpent,
      });
    }

    // Total statistics
    const allParticipants = await ExpenseParticipant.find({
      userId,
      expenseId: { $in: expenses.map((e: any) => e._id) },
    });

    const totalSpent = allParticipants.reduce(
      (sum, p) => sum + p.owedAmount,
      0
    );
    const totalPaid = allParticipants.reduce(
      (sum, p) => sum + p.paidAmount,
      0
    );

    // Settlement stats
    const settlements = await Settlement.find({
      $or: [{ fromUserId: userId }, { toUserId: userId }],
      date: { $gte: startDate },
    });

    const totalSettled = settlements.reduce(
      (sum, s) => sum + s.amount,
      0
    );

    return NextResponse.json(
      {
        summary: {
          totalExpenses: expenses.length,
          totalSpent,
          totalPaid,
          totalSettled,
          averageExpense: expenses.length > 0 ? totalSpent / expenses.length : 0,
        },
        categoryBreakdown,
        monthlyTrend: monthlyData,
        topCategories: categoryBreakdown
          .sort((a, b) => b.total - a.total)
          .slice(0, 5),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function getStartDate(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), quarter * 3, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(0);
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const timeframe = searchParams.get("timeframe") || "month";
    const startDate = getStartDate(timeframe);
    const supabase = requireSupabaseAdmin();

    const cacheKey = buildUserScopedCacheKey(
      "analytics",
      userId,
      `timeframe=${timeframe}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.analytics, async () => {
      const { data: userParticipants, error: participantsError } = await supabase
        .from("expense_participants")
        .select("expense_id,owed_amount,paid_amount")
        .eq("user_id", userId);
      if (participantsError) {
        throw participantsError;
      }

      const expenseIds = Array.from(
        new Set((userParticipants || []).map((participant: any) => String(participant.expense_id)))
      );
      if (expenseIds.length === 0) {
        return {
          summary: {
            totalExpenses: 0,
            totalSpent: 0,
            totalPaid: 0,
            totalSettled: 0,
            averageExpense: 0,
          },
          categoryBreakdown: [],
          monthlyTrend: [],
          topCategories: [],
        };
      }

      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("id,amount,category,date,is_deleted")
        .in("id", expenseIds)
        .eq("is_deleted", false)
        .gte("date", startDate.toISOString());
      if (expensesError) {
        throw expensesError;
      }

      const expenseRows = expenses || [];
      const filteredExpenseIds = new Set(expenseRows.map((row: any) => String(row.id)));
      const participantByExpense = new Map<string, any>();
      for (const participant of userParticipants || []) {
        const expenseId = String(participant.expense_id);
        if (filteredExpenseIds.has(expenseId)) {
          participantByExpense.set(expenseId, participant);
        }
      }

      const categoryData = expenseRows.reduce((acc: Record<string, { count: number; total: number }>, expense: any) => {
        const category = String(expense.category || "other");
        if (!acc[category]) {
          acc[category] = { count: 0, total: 0 };
        }
        acc[category].count += 1;
        acc[category].total += Number(expense.amount || 0);
        return acc;
      }, {});

      const categoryBreakdown = Object.keys(categoryData).map((category) => ({
        category,
        count: categoryData[category].count,
        total: round2(categoryData[category].total),
      }));

      const now = new Date();
      const monthlyTrend: Array<{ month: string; expenses: number; total: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

        const monthExpenses = expenseRows.filter((expense: any) => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= monthStart && expenseDate <= monthEnd;
        });

        let totalSpentForMonth = 0;
        for (const expense of monthExpenses) {
          const participant = participantByExpense.get(String(expense.id));
          totalSpentForMonth += Number(participant?.owed_amount || 0);
        }

        monthlyTrend.push({
          month: monthStart.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          }),
          expenses: monthExpenses.length,
          total: round2(totalSpentForMonth),
        });
      }

      let totalSpent = 0;
      let totalPaid = 0;
      for (const participant of participantByExpense.values()) {
        totalSpent += Number(participant.owed_amount || 0);
        totalPaid += Number(participant.paid_amount || 0);
      }

      const { data: settlements, error: settlementsError } = await supabase
        .from("settlements")
        .select("amount")
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .gte("date", startDate.toISOString());
      if (settlementsError) {
        throw settlementsError;
      }

      const totalSettled = (settlements || []).reduce(
        (sum: number, settlement: any) => sum + Number(settlement.amount || 0),
        0
      );

      const summary = {
        totalExpenses: expenseRows.length,
        totalSpent: round2(totalSpent),
        totalPaid: round2(totalPaid),
        totalSettled: round2(totalSettled),
        averageExpense: expenseRows.length > 0 ? round2(totalSpent / expenseRows.length) : 0,
      };

      return {
        summary,
        categoryBreakdown,
        monthlyTrend,
        topCategories: [...categoryBreakdown]
          .sort((a, b) => b.total - a.total)
          .slice(0, 5),
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    console.error("Get analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

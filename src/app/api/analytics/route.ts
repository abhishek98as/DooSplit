import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import {
  fetchDocsByIds,
  logSlowRoute,
  toNum,
  uniqueStrings,
} from "@/lib/firestore/route-helpers";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

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

function toDateMs(value: any): number {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const timeframe = searchParams.get("timeframe") || "month";
    const startDate = getStartDate(timeframe);

    const cacheKey = buildUserScopedCacheKey(
      "analytics",
      userId,
      `timeframe=${timeframe}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.analytics, async () => {
      const db = getAdminDb();
      const userParticipantsSnap = await db
        .collection("expense_participants")
        .where("user_id", "==", userId)
        .get();

      const userParticipants: any[] = userParticipantsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      }));

      const expenseIds = uniqueStrings(
        userParticipants.map((participant: any) => String(participant.expense_id || ""))
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

      const expensesById = await fetchDocsByIds("expenses", expenseIds);
      const expenseRows = Array.from(expensesById.values()).filter((row: any) => {
        if (row.is_deleted) {
          return false;
        }
        const rowDate = toDateMs(row.date || row.created_at || row._created_at);
        return rowDate >= startDate.getTime();
      });

      const filteredExpenseIds = new Set(expenseRows.map((row: any) => String(row.id || "")));
      const participantByExpense = new Map<string, any>();
      for (const participant of userParticipants || []) {
        const expenseId = String(participant.expense_id || "");
        if (filteredExpenseIds.has(expenseId)) {
          participantByExpense.set(expenseId, participant);
        }
      }

      const categoryData = expenseRows.reduce(
        (acc: Record<string, { count: number; total: number }>, expense: any) => {
          const category = String(expense.category || "other");
          if (!acc[category]) {
            acc[category] = { count: 0, total: 0 };
          }
          acc[category].count += 1;
          acc[category].total += toNum(expense.amount);
          return acc;
        },
        {}
      );

      const categoryBreakdown = Object.keys(categoryData).map((category) => ({
        category,
        count: categoryData[category].count,
        total: round2(categoryData[category].total),
      }));

      const now = new Date();
      const monthlyTrend: Array<{ month: string; expenses: number; total: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
          999
        );

        const monthExpenses = expenseRows.filter((expense: any) => {
          const expenseDate = toDateMs(expense.date || expense.created_at || expense._created_at);
          return expenseDate >= monthStart.getTime() && expenseDate <= monthEnd.getTime();
        });

        let totalSpentForMonth = 0;
        for (const expense of monthExpenses) {
          const participant = participantByExpense.get(String(expense.id || ""));
          totalSpentForMonth += toNum(participant?.owed_amount);
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
        totalSpent += toNum(participant.owed_amount);
        totalPaid += toNum(participant.paid_amount);
      }

      const [fromSettlementsSnap, toSettlementsSnap] = await Promise.all([
        db
          .collection("settlements")
          .where("from_user_id", "==", userId)
          .where("date", ">=", startDate.toISOString())
          .get(),
        db
          .collection("settlements")
          .where("to_user_id", "==", userId)
          .where("date", ">=", startDate.toISOString())
          .get(),
      ]);

      const settlementMap = new Map<string, any>();
      for (const doc of [...fromSettlementsSnap.docs, ...toSettlementsSnap.docs]) {
        settlementMap.set(doc.id, { id: doc.id, ...((doc.data() as any) || {}) });
      }

      const totalSettled = Array.from(settlementMap.values()).reduce(
        (sum: number, settlement: any) => sum + toNum(settlement.amount),
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

    const routeMs = logSlowRoute("/api/analytics", routeStart);
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(routeMs),
      },
    });
  } catch (error: any) {
    console.error("Get analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}


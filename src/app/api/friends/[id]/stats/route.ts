import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getFriendshipStatus } from "@/lib/social/friendship-store";
import {
  listExpenseIdsByParticipant,
  getExpensesByIds,
  listExpenseParticipants,
} from "@/lib/dynamodb/entities/expenses";
import { queryUserSettlementFeed } from "@/lib/dynamodb/entities/settlements";

export const dynamic = "force-dynamic";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const friendId = id;

    const friendship = await getFriendshipStatus(userId, friendId);
    if (friendship.status !== "accepted") {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const cacheKey = buildUserScopedCacheKey(
      "friend-details",
      userId,
      `stats:${friendId}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const myExpenseRefs = await listExpenseIdsByParticipant(userId);
      const friendExpenseRefs = await listExpenseIdsByParticipant(friendId);
      const friendExpenseIds = new Set(friendExpenseRefs.map((r) => r.expense_id));
      const pairExpenseIds = myExpenseRefs
        .map((r) => r.expense_id)
        .filter((eid) => friendExpenseIds.has(eid));

      let expenses: any[] = [];
      const categoryStats: Record<string, number> = {};
      const monthlyStats: Record<string, number> = {};
      let totalExpenses = 0;

      if (pairExpenseIds.length > 0) {
        expenses = await getExpensesByIds(pairExpenseIds);
        expenses = expenses.filter((e) => e && !e.is_deleted);

        for (const expense of expenses) {
          const participants = await listExpenseParticipants(expense.id);
          const userParticipant = participants.find((p) => p.user_id === userId);
          if (!userParticipant) continue;

          const userShare = Number(userParticipant.amount_owed || 0);
          const category = String(expense.category || "other");
          categoryStats[category] = (categoryStats[category] || 0) + userShare;
          totalExpenses += userShare;

          const dateStr = expense.date || expense.created_at;
          const monthKey = new Date(dateStr).toISOString().substring(0, 7);
          monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + userShare;
        }
      }

      const { items: allSettlements } = await queryUserSettlementFeed(userId, 2000);
      const settlements = allSettlements.filter(
        (s) =>
          !s.is_deleted &&
          ((s.from_user_id === userId && s.to_user_id === friendId) ||
            (s.from_user_id === friendId && s.to_user_id === userId))
      );

      let totalSettlements = 0;
      for (const settlement of settlements) {
        const isFromUser = settlement.from_user_id === userId;
        const amt = Number(settlement.amount || 0);
        totalSettlements += isFromUser ? amt : -amt;
      }

      const categoryBreakdown = Object.entries(categoryStats).map(([category, amount]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        amount: round2(amount),
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
      }));

      const monthlyTrend = Object.entries(monthlyStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({
          month: new Date(`${month}-01`).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          }),
          amount: round2(amount),
        }));

      return {
        totalExpenses: round2(totalExpenses),
        totalSettlements: round2(totalSettlements),
        netBalance: round2(totalExpenses - totalSettlements),
        categoryBreakdown,
        monthlyTrend,
        expenseCount: expenses.length,
        settlementCount: settlements.length,
      };
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Get friend stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}

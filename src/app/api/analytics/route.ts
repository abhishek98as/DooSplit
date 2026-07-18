import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { queryUserExpenseFeed } from "@/lib/dynamodb/entities/expenses";
import { listSettlementsForUser } from "@/lib/dynamodb/entities/settlements";
import type { DdbExpenseFeed } from "@/lib/dynamodb/types";

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
  return Math.round(value * 100) / 100;
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toDateMs(value: unknown): number {
  if (!value) return 0;
  const date = new Date(value as string);
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
      // Fetch all user expense feed items (up to 5000 — enough for analytics)
      const { items: allFeedItems } = await queryUserExpenseFeed(userId, 5000);

      // Filter by timeframe
      const feedItems: DdbExpenseFeed[] = allFeedItems.filter((item) => {
        if (item.is_deleted) return false;
        const itemDateMs = toDateMs(item.date || item.created_at);
        return itemDateMs >= startDate.getTime();
      });

      if (feedItems.length === 0) {
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

      // Category breakdown
      const categoryData: Record<string, { count: number; total: number }> = {};
      for (const item of feedItems) {
        const category = String(item.category || "other");
        if (!categoryData[category]) {
          categoryData[category] = { count: 0, total: 0 };
        }
        categoryData[category].count += 1;
        categoryData[category].total += toNum(item.amount);
      }

      const categoryBreakdown = Object.keys(categoryData).map((category) => ({
        category,
        count: categoryData[category].count,
        total: round2(categoryData[category].total),
      }));

      // Monthly trend (last 6 months)
      const now = new Date();
      const monthlyTrend: Array<{ month: string; expenses: number; total: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23, 59, 59, 999
        );

        const monthExpenses = feedItems.filter((item) => {
          const itemDateMs = toDateMs(item.date || item.created_at);
          return itemDateMs >= monthStart.getTime() && itemDateMs <= monthEnd.getTime();
        });

        let totalSpentForMonth = 0;
        for (const item of monthExpenses) {
          totalSpentForMonth += toNum(item.amount_owed);
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

      // Totals from participant data in feed
      let totalSpent = 0;
      let totalPaid = 0;
      for (const item of feedItems) {
        totalSpent += toNum(item.amount_owed);
        totalPaid += toNum(item.amount_paid);
      }

      // Settlements
      let totalSettled = 0;
      try {
        const settlementFeed = await listSettlementsForUser(userId);
        for (const s of settlementFeed) {
          if (s.is_deleted) continue;
          const sDateMs = toDateMs(s.date || s.created_at);
          if (sDateMs >= startDate.getTime()) {
            totalSettled += toNum(s.amount);
          }
        }
      } catch (settlementError) {
        console.error("[analytics] Settlement fetch failed:", settlementError);
      }

      const summary = {
        totalExpenses: feedItems.length,
        totalSpent: round2(totalSpent),
        totalPaid: round2(totalPaid),
        totalSettled: round2(totalSettled),
        averageExpense: feedItems.length > 0 ? round2(totalSpent / feedItems.length) : 0,
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

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Response-Time": `${Date.now() - routeStart}ms`,
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

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { queryUserExpenseFeed } from "@/lib/dynamodb/entities/expenses";
import { listSettlementsForUser } from "@/lib/dynamodb/entities/settlements";
import type { DdbExpenseFeed, DdbSettlementFeed } from "@/lib/dynamodb/types";

export const dynamic = "force-dynamic";

function toDateMs(value: unknown): number {
  if (!value) return 0;
  const date = new Date(value as string);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateOrFallback(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;
    const searchParams = request.nextUrl.searchParams;

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = parseDateOrFallback(searchParams.get("startDate"), defaultStart);
    const endDate = parseDateOrFallback(searchParams.get("endDate"), now);

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    // Fetch all expense feed items and settlements in parallel
    const [expenseFeedResult, allSettlementFeed] = await Promise.all([
      queryUserExpenseFeed(userId, 5000),
      listSettlementsForUser(userId),
    ]);

    const feedItems: DdbExpenseFeed[] = expenseFeedResult.items.filter(
      (item) => !item.is_deleted
    );

    // Map settlements to include direction info
    const allSettlements = allSettlementFeed
      .filter((s) => !s.is_deleted)
      .map((s) => ({
        ...s,
        direction: s.from_user_id === userId ? ("outgoing" as const) : ("incoming" as const),
      }));

    const computeExpenseDeltaUntil = (cutoffMs: number) => {
      let delta = 0;
      for (const item of feedItems) {
        const expenseMs = toDateMs(item.date || item.created_at);
        if (expenseMs <= cutoffMs) {
          delta += toNum(item.amount_paid) - toNum(item.amount_owed);
        }
      }
      return delta;
    };

    const computeSettlementDeltaUntil = (cutoffMs: number) => {
      let delta = 0;
      for (const settlement of allSettlements) {
        const settlementMs = toDateMs(settlement.date || settlement.created_at);
        if (settlementMs > cutoffMs) continue;
        const amount = toNum(settlement.amount);
        delta += settlement.direction === "incoming" ? amount : -amount;
      }
      return delta;
    };

    const openingCutoff = startMs - 1;
    const openingBalance =
      computeExpenseDeltaUntil(openingCutoff) + computeSettlementDeltaUntil(openingCutoff);
    const closingBalance =
      computeExpenseDeltaUntil(endMs) + computeSettlementDeltaUntil(endMs);

    const expenseChanges = feedItems
      .map((item) => {
        const expenseMs = toDateMs(item.date || item.created_at);
        if (expenseMs < startMs || expenseMs > endMs) return null;

        const delta = toNum(item.amount_paid) - toNum(item.amount_owed);
        return {
          id: String(item.expense_id || ""),
          type: "expense",
          date: new Date(expenseMs).toISOString(),
          description: String(item.description || "Expense"),
          category: String(item.category || "other"),
          amount: toNum(item.amount),
          delta: round2(delta),
          currency: String(item.currency || "INR"),
        };
      })
      .filter(Boolean) as any[];

    const settlementChanges = allSettlements
      .map((settlement) => {
        const settlementMs = toDateMs(settlement.date || settlement.created_at);
        if (settlementMs < startMs || settlementMs > endMs) return null;

        const amount = toNum(settlement.amount);
        const signedDelta = settlement.direction === "incoming" ? amount : -amount;

        return {
          id: String(settlement.settlement_id || ""),
          type: "settlement",
          date: new Date(settlementMs).toISOString(),
          description:
            settlement.direction === "incoming"
              ? "Settlement received"
              : "Settlement paid",
          amount,
          delta: round2(signedDelta),
          currency: String(settlement.currency || "INR"),
        };
      })
      .filter(Boolean) as any[];

    const expenseDelta = round2(
      expenseChanges.reduce((sum: number, change: any) => sum + toNum(change.delta), 0)
    );
    const settlementDelta = round2(
      settlementChanges.reduce((sum: number, change: any) => sum + toNum(change.delta), 0)
    );
    const netChange = round2(expenseDelta + settlementDelta);

    return NextResponse.json(
      {
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          openingBalance: round2(openingBalance),
          expenseDelta,
          settlementDelta,
          netChange,
          closingBalance: round2(closingBalance),
        },
        changes: {
          expenses: expenseChanges,
          settlements: settlementChanges,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get reconciliation report error:", error);
    return NextResponse.json(
      { error: "Failed to generate reconciliation report" },
      { status: 500 }
    );
  }
}

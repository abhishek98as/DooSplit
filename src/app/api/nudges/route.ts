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
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/firestore/route-helpers";

export const dynamic = "force-dynamic";

interface NudgeItem {
  id: string;
  type: "pending_expense" | "habit" | "followup";
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, any>;
}

function toDateMs(value: any): number {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function diffDays(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;
    const cacheKey = buildUserScopedCacheKey("nudges", userId, "v1");

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.analytics, async () => {
      const db = getAdminDb();
      const now = Date.now();

      const participantSnap = await db
        .collection("expense_participants")
        .where("user_id", "==", userId)
        .get();

      const participantRows: any[] = participantSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));

      const expenseIds = uniqueStrings(
        participantRows.map((row: any) => String(row.expense_id || ""))
      );
      const expensesById = await fetchDocsByIds("expenses", expenseIds);

      const pendingExpenseNudges: NudgeItem[] = [];
      for (const participant of participantRows) {
        const expense = expensesById.get(String(participant.expense_id || ""));
        if (!expense || expense.is_deleted) {
          continue;
        }

        const owedAmount = toNum(participant.owed_amount);
        const paidAmount = toNum(participant.paid_amount);
        const pendingAmount = Math.max(0, owedAmount - paidAmount);
        if (pendingAmount <= 0) {
          continue;
        }

        const expenseDateMs = toDateMs(expense.date || expense.created_at || expense._created_at);
        const ageDays = diffDays(expenseDateMs, now);
        if (ageDays < 10) {
          continue;
        }

        pendingExpenseNudges.push({
          id: `pending_${String(expense.id || participant.expense_id)}`,
          type: "pending_expense",
          severity: ageDays >= 20 ? "high" : "medium",
          title: `Pending for ${ageDays} days`,
          message: `You still have ${pendingAmount.toFixed(2)} pending for "${String(expense.description || "Expense")}".`,
          actionLabel: "Review expense",
          actionHref: `/expenses/edit/${String(expense.id || participant.expense_id)}`,
          metadata: {
            expenseId: String(expense.id || participant.expense_id),
            pendingAmount,
            ageDays,
          },
        });
      }

      pendingExpenseNudges.sort(
        (a, b) => Number(b.metadata?.ageDays || 0) - Number(a.metadata?.ageDays || 0)
      );

      const settlementSnap = await db
        .collection("settlements")
        .where("from_user_id", "==", userId)
        .get();

      const settlementRows: any[] = settlementSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));

      const last90DaysMs = now - 90 * 24 * 60 * 60 * 1000;
      const recentSettlements = settlementRows.filter((row: any) =>
        toDateMs(row.date || row.created_at || row._created_at) >= last90DaysMs
      );

      let weekendSettlementCount = 0;
      for (const row of recentSettlements) {
        const date = new Date(toDateMs(row.date || row.created_at || row._created_at));
        const day = date.getDay();
        if (day === 0 || day === 6) {
          weekendSettlementCount += 1;
        }
      }

      const nudges: NudgeItem[] = [...pendingExpenseNudges.slice(0, 3)];

      if (recentSettlements.length >= 4) {
        const weekendRatio = weekendSettlementCount / recentSettlements.length;
        if (weekendRatio >= 0.6) {
          nudges.push({
            id: "habit_weekend_settlement",
            type: "habit",
            severity: "low",
            title: "Weekend settlement pattern detected",
            message: "You usually settle on weekends. Want to schedule your next settlement reminder for this weekend?",
            actionLabel: "Set reminder",
            actionHref: "/settlements",
            metadata: {
              weekendRatio,
              sampleSize: recentSettlements.length,
            },
          });
        }
      }

      const friendIds = uniqueStrings(
        recentSettlements.map((row: any) => String(row.to_user_id || ""))
      );
      if (friendIds.length > 0) {
        const usersMap = await fetchDocsByIds("users", friendIds);
        const topFriendId = friendIds[0];
        const topFriend = mapUser(usersMap.get(topFriendId));
        if (topFriend) {
          nudges.push({
            id: "followup_frequent_counterparty",
            type: "followup",
            severity: "low",
            title: "Frequent follow-up opportunity",
            message: `You settle often with ${topFriend.name}. Consider a monthly recurring check-in to close balances faster.`,
            actionLabel: "Open friend details",
            actionHref: `/friends/${topFriend._id}`,
          });
        }
      }

      return {
        nudges,
        generatedAt: toIso(new Date().toISOString()),
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Get nudges error:", error);
    return NextResponse.json({ error: "Failed to fetch nudges" }, { status: 500 });
  }
}

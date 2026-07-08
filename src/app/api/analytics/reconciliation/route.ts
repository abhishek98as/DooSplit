import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { fetchDocsByIds, toNum, uniqueStrings } from "@/lib/firestore/route-helpers";

export const dynamic = "force-dynamic";

function toDateMs(value: any): number {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseDateOrFallback(value: string | null, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
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

    const db = getAdminDb();
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

    const [outgoingSettlementSnap, incomingSettlementSnap] = await Promise.all([
      db.collection("settlements").where("from_user_id", "==", userId).get(),
      db.collection("settlements").where("to_user_id", "==", userId).get(),
    ]);

    const outgoingSettlements: any[] = outgoingSettlementSnap.docs.map((doc) => ({
      id: doc.id,
      direction: "outgoing" as const,
      ...(doc.data() || {}),
    }));

    const incomingSettlements: any[] = incomingSettlementSnap.docs.map((doc) => ({
      id: doc.id,
      direction: "incoming" as const,
      ...(doc.data() || {}),
    }));

    const allSettlements: any[] = [...outgoingSettlements, ...incomingSettlements];

    const computeExpenseDeltaUntil = (cutoffMs: number) => {
      let delta = 0;
      for (const participant of participantRows) {
        const expense = expensesById.get(String(participant.expense_id || ""));
        if (!expense || expense.is_deleted) {
          continue;
        }
        const expenseMs = toDateMs(expense.date || expense.created_at || expense._created_at);
        if (expenseMs <= cutoffMs) {
          delta += toNum(participant.amount_paid) - toNum(participant.amount_owed);
        }
      }
      return delta;
    };

    const computeSettlementDeltaUntil = (cutoffMs: number) => {
      let delta = 0;
      for (const settlement of allSettlements) {
        const settlementMs = toDateMs(
          settlement.date || settlement.created_at || settlement._created_at
        );
        if (settlementMs > cutoffMs) {
          continue;
        }
        const amount = toNum(settlement.amount);
        delta += settlement.direction === "incoming" ? amount : -amount;
      }
      return delta;
    };

    const openingCutoff = startMs - 1;
    const openingBalance = computeExpenseDeltaUntil(openingCutoff) + computeSettlementDeltaUntil(openingCutoff);
    const closingBalance = computeExpenseDeltaUntil(endMs) + computeSettlementDeltaUntil(endMs);

    const expenseChanges = participantRows
      .map((participant: any) => {
        const expense = expensesById.get(String(participant.expense_id || ""));
        if (!expense || expense.is_deleted) {
          return null;
        }

        const expenseMs = toDateMs(expense.date || expense.created_at || expense._created_at);
        if (expenseMs < startMs || expenseMs > endMs) {
          return null;
        }

        const delta = toNum(participant.amount_paid) - toNum(participant.amount_owed);
        return {
          id: String(expense.id || participant.expense_id || ""),
          type: "expense",
          date: new Date(expenseMs).toISOString(),
          description: String(expense.description || "Expense"),
          category: String(expense.category || "other"),
          amount: toNum(expense.amount),
          delta: round2(delta),
          currency: String(expense.currency || "INR"),
        };
      })
      .filter(Boolean) as any[];

    const settlementChanges = allSettlements
      .map((settlement: any) => {
        const settlementMs = toDateMs(
          settlement.date || settlement.created_at || settlement._created_at
        );
        if (settlementMs < startMs || settlementMs > endMs) {
          return null;
        }

        const amount = toNum(settlement.amount);
        const signedDelta = settlement.direction === "incoming" ? amount : -amount;

        return {
          id: String(settlement.id || ""),
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

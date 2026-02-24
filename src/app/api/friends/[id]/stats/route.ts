import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { fetchDocsByIds, toIso, toNum } from "@/lib/firestore/route-helpers";
import { getFriendshipStatus } from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toDateMs(value: any): number {
  const iso = toIso(value);
  if (!iso) {
    return 0;
  }
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
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
      const db = getAdminDb();
      const [userParticipantsSnap, friendParticipantsSnap] = await Promise.all([
        db.collection("expense_participants").where("user_id", "==", userId).get(),
        db.collection("expense_participants").where("user_id", "==", friendId).get(),
      ]);

      const pairParticipants = [
        ...userParticipantsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
        ...friendParticipantsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
      ];

      const participantsByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants || []) {
        const expenseId = String(participant.expense_id || "");
        const list = participantsByExpense.get(expenseId) || [];
        list.push(participant);
        participantsByExpense.set(expenseId, list);
      }

      const pairExpenseIds = Array.from(participantsByExpense.entries())
        .filter(([, participants]) => {
          const users = new Set(participants.map((p) => String(p.user_id || "")));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      const expensesById = await fetchDocsByIds("expenses", pairExpenseIds);
      const expenses = Array.from(expensesById.values())
        .filter((row: any) => !row.is_deleted)
        .sort((a: any, b: any) => toDateMs(a.date) - toDateMs(b.date));

      const categoryStats: Record<string, number> = {};
      const monthlyStats: Record<string, number> = {};
      let totalExpenses = 0;

      for (const expense of expenses) {
        const participants = participantsByExpense.get(String(expense.id || "")) || [];
        const userParticipant = participants.find(
          (participant: any) => String(participant.user_id || "") === userId
        );
        const friendParticipant = participants.find(
          (participant: any) => String(participant.user_id || "") === friendId
        );

        if (!userParticipant || !friendParticipant) {
          continue;
        }

        const userShare = toNum(userParticipant.owed_amount);
        const category = String(expense.category || "other");
        categoryStats[category] = (categoryStats[category] || 0) + userShare;
        totalExpenses += userShare;

        const monthKey = new Date(toIso(expense.date || expense.created_at || expense._created_at))
          .toISOString()
          .substring(0, 7);
        monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + userShare;
      }

      const [outgoingSettlementsSnap, incomingSettlementsSnap] = await Promise.all([
        db
          .collection("settlements")
          .where("from_user_id", "==", userId)
          .where("to_user_id", "==", friendId)
          .get(),
        db
          .collection("settlements")
          .where("from_user_id", "==", friendId)
          .where("to_user_id", "==", userId)
          .get(),
      ]);

      const settlements = [
        ...outgoingSettlementsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
        ...incomingSettlementsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
      ];

      let totalSettlements = 0;
      for (const settlement of settlements || []) {
        const isFromUser = String(settlement.from_user_id || "") === userId;
        totalSettlements += isFromUser
          ? toNum(settlement.amount)
          : -toNum(settlement.amount);
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


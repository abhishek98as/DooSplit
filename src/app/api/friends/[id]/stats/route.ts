import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

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
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const friendId = id;
    const supabase = requireSupabaseAdmin();

    const { data: friendship, error: friendshipError } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${friendId},status.eq.accepted),and(user_id.eq.${friendId},friend_id.eq.${userId},status.eq.accepted)`
      )
      .limit(1)
      .maybeSingle();
    if (friendshipError) {
      throw friendshipError;
    }
    if (!friendship) {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const cacheKey = buildUserScopedCacheKey(
      "friend-details",
      userId,
      `stats:${friendId}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const { data: pairParticipants, error: pairError } = await supabase
        .from("expense_participants")
        .select("expense_id,user_id,owed_amount")
        .in("user_id", [userId, friendId]);
      if (pairError) {
        throw pairError;
      }

      const participantsByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants || []) {
        const expenseId = String(participant.expense_id);
        const list = participantsByExpense.get(expenseId) || [];
        list.push(participant);
        participantsByExpense.set(expenseId, list);
      }

      const pairExpenseIds = Array.from(participantsByExpense.entries())
        .filter(([, participants]) => {
          const users = new Set(participants.map((p) => String(p.user_id)));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      let expenses: any[] = [];
      if (pairExpenseIds.length > 0) {
        const { data, error } = await supabase
          .from("expenses")
          .select("id,category,date,is_deleted")
          .in("id", pairExpenseIds)
          .eq("is_deleted", false)
          .order("date", { ascending: true });
        if (error) {
          throw error;
        }
        expenses = data || [];
      }

      const categoryStats: Record<string, number> = {};
      const monthlyStats: Record<string, number> = {};
      let totalExpenses = 0;

      for (const expense of expenses) {
        const participants = participantsByExpense.get(String(expense.id)) || [];
        const userParticipant = participants.find(
          (participant: any) => String(participant.user_id) === userId
        );
        const friendParticipant = participants.find(
          (participant: any) => String(participant.user_id) === friendId
        );

        if (!userParticipant || !friendParticipant) {
          continue;
        }

        const userShare = Number(userParticipant.owed_amount || 0);
        const category = String(expense.category || "other");
        categoryStats[category] = (categoryStats[category] || 0) + userShare;
        totalExpenses += userShare;

        const monthKey = new Date(expense.date).toISOString().substring(0, 7);
        monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + userShare;
      }

      const { data: settlements, error: settlementsError } = await supabase
        .from("settlements")
        .select("from_user_id,to_user_id,amount")
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
        );
      if (settlementsError) {
        throw settlementsError;
      }

      let totalSettlements = 0;
      for (const settlement of settlements || []) {
        const isFromUser = String(settlement.from_user_id) === userId;
        totalSettlements += isFromUser
          ? Number(settlement.amount || 0)
          : -Number(settlement.amount || 0);
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
        settlementCount: (settlements || []).length,
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

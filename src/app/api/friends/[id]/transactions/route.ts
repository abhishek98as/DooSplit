import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function toNum(value: any): number {
  return Number(value || 0);
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
      "friend-transactions",
      userId,
      `${friendId}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      const transactions: any[] = [];

      const { data: pairParticipants, error: pairError } = await supabase
        .from("expense_participants")
        .select("expense_id,user_id,paid_amount,owed_amount")
        .in("user_id", [userId, friendId]);
      if (pairError) {
        throw pairError;
      }

      const pairByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants || []) {
        const key = String(participant.expense_id);
        const list = pairByExpense.get(key) || [];
        list.push(participant);
        pairByExpense.set(key, list);
      }

      const expenseIds = Array.from(pairByExpense.entries())
        .filter(([, participants]) => {
          const users = new Set(participants.map((participant) => String(participant.user_id)));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      if (expenseIds.length > 0) {
        const { data: expenses, error: expensesError } = await supabase
          .from("expenses")
          .select("id,description,currency,created_at,created_by,group_id,is_deleted")
          .in("id", expenseIds)
          .eq("is_deleted", false);
        if (expensesError) {
          throw expensesError;
        }

        const { data: allParticipants, error: participantsError } = await supabase
          .from("expense_participants")
          .select("expense_id,is_settled")
          .in("expense_id", expenseIds);
        if (participantsError) {
          throw participantsError;
        }
        const settledByExpense = new Map<string, boolean>();
        for (const participant of allParticipants || []) {
          const key = String(participant.expense_id);
          if (!settledByExpense.has(key)) {
            settledByExpense.set(key, true);
          }
          if (!participant.is_settled) {
            settledByExpense.set(key, false);
          }
        }

        const userIds = Array.from(new Set((expenses || []).map((e: any) => String(e.created_by))));
        const groupIds = Array.from(
          new Set(
            (expenses || [])
              .map((e: any) => (e.group_id ? String(e.group_id) : ""))
              .filter(Boolean)
          )
        );

        const { data: users } = await supabase
          .from("users")
          .select("id,name,profile_picture")
          .in("id", userIds.length > 0 ? userIds : ["__none__"]);
        const usersMap = new Map((users || []).map((u: any) => [String(u.id), u]));

        const { data: groups } = await supabase
          .from("groups")
          .select("id,name")
          .in("id", groupIds.length > 0 ? groupIds : ["__none__"]);
        const groupsMap = new Map((groups || []).map((g: any) => [String(g.id), g]));

        for (const expense of expenses || []) {
          const participants = pairByExpense.get(String(expense.id)) || [];
          const userParticipant = participants.find(
            (participant: any) => String(participant.user_id) === userId
          );
          if (!userParticipant) {
            continue;
          }

          const netAmount = toNum(userParticipant.owed_amount);
          const isPositive =
            toNum(userParticipant.paid_amount) > toNum(userParticipant.owed_amount);
          const creator = usersMap.get(String(expense.created_by));
          const group = expense.group_id
            ? groupsMap.get(String(expense.group_id))
            : null;

          transactions.push({
            id: expense.id,
            type: "expense",
            description: expense.description,
            amount: Math.abs(netAmount),
            currency: expense.currency,
            createdAt: expense.created_at,
            isSettlement: false,
            settled: settledByExpense.get(String(expense.id)) ?? false,
            group: group
              ? {
                  id: group.id,
                  name: group.name,
                }
              : null,
            isPositive,
            user: creator
              ? {
                  id: creator.id,
                  name: creator.name,
                  profilePicture: creator.profile_picture || null,
                }
              : null,
          });
        }
      }

      const { data: settlements, error: settlementsError } = await supabase
        .from("settlements")
        .select("id,from_user_id,to_user_id,amount,currency,created_at")
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
        )
        .order("created_at", { ascending: false });
      if (settlementsError) {
        throw settlementsError;
      }

      const settlementUserIds = Array.from(
        new Set(
          (settlements || []).flatMap((settlement: any) => [
            String(settlement.from_user_id),
            String(settlement.to_user_id),
          ])
        )
      );
      const { data: settlementUsers } = await supabase
        .from("users")
        .select("id,name,profile_picture")
        .in("id", settlementUserIds.length > 0 ? settlementUserIds : ["__none__"]);
      const settlementUsersMap = new Map(
        (settlementUsers || []).map((u: any) => [String(u.id), u])
      );

      for (const settlement of settlements || []) {
        const isFromUser = String(settlement.from_user_id) === userId;
        const otherUser = isFromUser
          ? settlementUsersMap.get(String(settlement.to_user_id))
          : settlementUsersMap.get(String(settlement.from_user_id));
        const action = isFromUser ? "paid" : "received payment from";

        transactions.push({
          id: settlement.id,
          type: "settlement",
          description: `You ${action} ${otherUser?.name || "Unknown"}`,
          amount: toNum(settlement.amount),
          currency: settlement.currency,
          createdAt: settlement.created_at,
          isSettlement: true,
          settled: true,
          user: otherUser
            ? {
                id: otherUser.id,
                name: otherUser.name,
                profilePicture: otherUser.profile_picture || null,
              }
            : null,
        });
      }

      transactions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        transactions,
        count: transactions.length,
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Get friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

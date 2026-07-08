import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { Expense, ExpenseParticipant, Settlement } from "@/lib/mongodb/models";
import {
  fetchDocsByIds,
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/mongodb/route-helpers";
import { logSlowRoute } from "@/lib/firestore/route-helpers";
import { User } from "@/lib/mongodb/models";
import { getFriendshipStatus } from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

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
      "friend-transactions",
      userId,
      `${friendId}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      const transactions: any[] = [];

      const [userParticipants, friendParticipants] = await Promise.all([
        ExpenseParticipant.find({ user_id: userId }).lean(),
        ExpenseParticipant.find({ user_id: friendId }).lean(),
      ]);

      const pairByExpense = new Map<string, any[]>();
      for (const participant of [...userParticipants, ...friendParticipants]) {
        const key = String(participant.expense_id || "");
        const list = pairByExpense.get(key) || [];
        list.push(participant);
        pairByExpense.set(key, list);
      }

      const expenseIds = Array.from(pairByExpense.entries())
        .filter(([, participants]) => {
          const users = new Set(participants.map((p) => String(p.user_id || "")));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      if (expenseIds.length > 0) {
        const [expensesById, allParticipants] = await Promise.all([
          fetchDocsByIds(Expense, expenseIds),
          (async () => {
            const results = await Promise.all(
              expenseIds.map((eid) =>
                ExpenseParticipant.find({ expense_id: eid }).lean()
              )
            );
            return results.flat();
          })(),
        ]);

        const expenses = Array.from(expensesById.values()).filter((row: any) => !row.is_deleted) as any[];

        const settledByExpense = new Map<string, boolean>();
        for (const participant of allParticipants || []) {
          const key = String(participant.expense_id || "");
          if (!settledByExpense.has(key)) {
            settledByExpense.set(key, true);
          }
          if (!participant.is_settled) {
            settledByExpense.set(key, false);
          }
        }

        const userIds = uniqueStrings((expenses || []).map((expense: any) => String(expense.created_by || "")));
        const groupIds = uniqueStrings(
          (expenses || []).map((expense: any) =>
            expense.group_id ? String(expense.group_id) : ""
          )
        );
        const [usersMap, groupsMap] = await Promise.all([
          fetchDocsByIds("users", userIds),
          fetchDocsByIds("groups", groupIds),
        ]);

        for (const expense of expenses || []) {
          const participants = pairByExpense.get(String(expense.id || "")) || [];
          const userParticipant = participants.find(
            (participant: any) => String(participant.user_id || "") === userId
          );
          if (!userParticipant) {
            continue;
          }

          const netAmount = toNum(userParticipant.owed_amount);
          const isPositive =
            toNum(userParticipant.amount_paid) > toNum(userParticipant.amount_owed);
          const creator = usersMap.get(String(expense.created_by || "")) as any;
          const group = (expense.group_id
            ? groupsMap.get(String(expense.group_id || ""))
            : null) as any;

          transactions.push({
            id: String(expense.id || ""),
            type: "expense",
            description: String(expense.description || ""),
            amount: Math.abs(netAmount),
            currency: String(expense.currency || "INR"),
            createdAt: toIso(expense.created_at || expense._created_at),
            isSettlement: false,
            settled: settledByExpense.get(String(expense.id || "")) ?? false,
            group: group
              ? {
                  id: String(group.id || ""),
                  name: String(group.name || "Group"),
                }
              : null,
            isPositive,
            user: creator ? mapUser(creator) : null,
          });
        }
      }

      const rawSettlements = await Settlement.find({
        $or: [
          { from_user_id: userId, to_user_id: friendId },
          { from_user_id: friendId, to_user_id: userId },
        ],
      }).lean();
      const settlements = rawSettlements
        .map((doc: any) => ({ ...doc, id: String(doc._id) }))
        .sort((a: any, b: any) => {
        const aMs = new Date(toIso(a.created_at || a._created_at || a.date)).getTime();
        const bMs = new Date(toIso(b.created_at || b._created_at || b.date)).getTime();
        return bMs - aMs;
      });

      const settlementUserIds = uniqueStrings(
        settlements.flatMap((settlement: any) => [
          String(settlement.from_user_id || ""),
          String(settlement.to_user_id || ""),
        ])
      );
      const settlementUsersMap = await fetchDocsByIds("users", settlementUserIds);

      for (const settlement of settlements || []) {
        const isFromUser = String(settlement.from_user_id || "") === userId;
        const otherUser = (isFromUser
          ? settlementUsersMap.get(String(settlement.to_user_id || ""))
          : settlementUsersMap.get(String(settlement.from_user_id || ""))) as any;
        const action = isFromUser ? "paid" : "received payment from";

        transactions.push({
          id: String(settlement.id || ""),
          type: "settlement",
          description: `You ${action} ${otherUser?.name || "Unknown"}`,
          amount: toNum(settlement.amount),
          currency: String(settlement.currency || "INR"),
          createdAt: toIso(settlement.created_at || settlement._created_at || settlement.date),
          isSettlement: true,
          settled: true,
          user: otherUser ? mapUser(otherUser) : null,
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

    const routeMs = logSlowRoute("/api/friends/[id]/transactions", routeStart);
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(routeMs),
      },
    });
  } catch (error: any) {
    console.error("Get friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}


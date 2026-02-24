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
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/firestore/route-helpers";
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
      const db = getAdminDb();
      const transactions: any[] = [];

      const [userParticipantsSnap, friendParticipantsSnap] = await Promise.all([
        db.collection("expense_participants").where("user_id", "==", userId).get(),
        db.collection("expense_participants").where("user_id", "==", friendId).get(),
      ]);

      const pairParticipants = [
        ...userParticipantsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
        ...friendParticipantsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
      ];

      const pairByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants || []) {
        const key = String(participant.expense_id || "");
        const list = pairByExpense.get(key) || [];
        list.push(participant);
        pairByExpense.set(key, list);
      }

      const expenseIds = Array.from(pairByExpense.entries())
        .filter(([, participants]) => {
          const users = new Set(participants.map((participant) => String(participant.user_id || "")));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      if (expenseIds.length > 0) {
        const [expensesById, allParticipants] = await Promise.all([
          fetchDocsByIds("expenses", expenseIds),
          Promise.all(
            expenseIds.map(async (expenseId) => {
              const snap = await db
                .collection("expense_participants")
                .where("expense_id", "==", expenseId)
                .get();
              return snap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));
            })
          ).then((chunks) => chunks.flat()),
        ]);

        const expenses = Array.from(expensesById.values()).filter((row: any) => !row.is_deleted);

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
            toNum(userParticipant.paid_amount) > toNum(userParticipant.owed_amount);
          const creator = usersMap.get(String(expense.created_by || ""));
          const group = expense.group_id
            ? groupsMap.get(String(expense.group_id || ""))
            : null;

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
      ].sort((a, b) => {
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
        const otherUser = isFromUser
          ? settlementUsersMap.get(String(settlement.to_user_id || ""))
          : settlementUsersMap.get(String(settlement.from_user_id || ""));
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


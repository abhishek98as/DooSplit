import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { toNum, uniqueStrings } from "@/lib/mongodb/route-helpers";
import { getFriendshipStatus } from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";

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

    // Check friendship status
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

      // 1. Fetch user's expenses from DynamoDB feed
      const { queryUserExpenseFeed, listExpenseIdsByParticipant, listExpenseParticipants } = await import("@/lib/dynamodb/entities/expenses");
      const { items: allUserExpenses } = await queryUserExpenseFeed(userId, 5000);

      // 2. Fetch friend's participant list to find shared expenses
      const friendExpenseRefs = await listExpenseIdsByParticipant(friendId);
      const friendExpenseIds = new Set(friendExpenseRefs.map((r) => r.expense_id));
      const sharedExpenses = allUserExpenses.filter((e) => friendExpenseIds.has(e.expense_id));

      if (sharedExpenses.length > 0) {
        // Fetch participant rows of each shared expense to evaluate settles and amount splits
        const participantsLists = await Promise.all(
          sharedExpenses.map((e) => listExpenseParticipants(e.expense_id))
        );

        const settledByExpense = new Map<string, boolean>();
        const pairByExpense = new Map<string, any[]>();
        
        for (let idx = 0; idx < sharedExpenses.length; idx++) {
          const expenseId = sharedExpenses[idx].expense_id;
          const plist = participantsLists[idx] || [];
          pairByExpense.set(expenseId, plist);

          // Mark settled only if all participants are settled
          let isSettled = true;
          for (const p of plist) {
            if (!p.is_settled) {
              isSettled = false;
              break;
            }
          }
          settledByExpense.set(expenseId, isSettled);
        }

        const creatorIds = uniqueStrings(sharedExpenses.map((e) => e.created_by));
        const groupIds = uniqueStrings(
          sharedExpenses.map((e) => e.group_id).filter((g): g is string => !!g)
        );

        const { getUsersByIds } = await import("@/lib/dynamodb/entities/users");
        const { getGroupsByIds } = await import("@/lib/dynamodb/entities/groups");

        const [usersList, groupsList] = await Promise.all([
          getUsersByIds(creatorIds),
          getGroupsByIds(groupIds),
        ]);

        const usersMap = new Map<string, any>(
          usersList.map((u) => [
            u.id,
            {
              id: u.id,
              name: u.name || "Unknown",
              email: u.email || "",
              profilePicture: u.photo_url || null,
            },
          ])
        );

        const groupsMap = new Map<string, any>(
          groupsList.map((g) => [g.id, g])
        );

        for (const expense of sharedExpenses) {
          const plist = pairByExpense.get(expense.expense_id) || [];
          const userParticipant = plist.find((p) => p.user_id === userId);
          if (!userParticipant) continue;

          const amountPaid = toNum(userParticipant.amount_paid);
          const amountOwed = toNum(userParticipant.amount_owed);
          const isPositive = amountPaid > amountOwed;
          // For friend feed context, netAmount is how much they paid minus owed
          const netAmount = isPositive ? amountPaid - amountOwed : amountOwed - amountPaid;

          const creator = usersMap.get(expense.created_by);
          const group = expense.group_id ? groupsMap.get(expense.group_id) : null;

          transactions.push({
            id: expense.expense_id,
            type: "expense",
            description: expense.description || "Untitled",
            amount: Math.abs(netAmount),
            currency: expense.currency || "INR",
            createdAt: expense.created_at,
            isSettlement: false,
            settled: settledByExpense.get(expense.expense_id) ?? false,
            group: group
              ? {
                  id: group.id,
                  name: group.name || "Group",
                }
              : null,
            isPositive,
            user: creator || null,
          });
        }
      }

      // 3. Fetch settlements between user and friend using DynamoDB feed index
      const { queryUserSettlementFeed } = await import("@/lib/dynamodb/entities/settlements");
      const { items: allSettlements } = await queryUserSettlementFeed(userId, 5000, undefined, { friendId });

      // Deduplicate settlements since they have sent and received feeds per settlement
      const seenSettlementIds = new Set<string>();
      const settlements = allSettlements.filter((s) => {
        if (seenSettlementIds.has(s.settlement_id)) return false;
        seenSettlementIds.add(s.settlement_id);
        return true;
      });

      const settlementUserIds = uniqueStrings(
        settlements.flatMap((s) => [s.from_user_id, s.to_user_id])
      );

      const { getUsersByIds } = await import("@/lib/dynamodb/entities/users");
      const settlementUsers = await getUsersByIds(settlementUserIds);
      const settlementUsersMap = new Map<string, any>(
        settlementUsers.map((u) => [
          u.id,
          {
            id: u.id,
            name: u.name || "Unknown",
            email: u.email || "",
            profilePicture: u.photo_url || null,
          },
        ])
      );

      for (const settlement of settlements) {
        const isFromUser = settlement.from_user_id === userId;
        const otherUserId = isFromUser ? settlement.to_user_id : settlement.from_user_id;
        const otherUser = settlementUsersMap.get(otherUserId);
        const action = isFromUser ? "paid" : "received payment from";

        transactions.push({
          id: settlement.settlement_id,
          type: "settlement",
          description: `You ${action} ${otherUser?.name || "Unknown"}`,
          amount: toNum(settlement.amount),
          currency: settlement.currency || "INR",
          createdAt: settlement.created_at,
          isSettlement: true,
          settled: true,
          user: otherUser || null,
        });
      }

      // Sort chronological newest first
      transactions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        transactions,
        count: transactions.length,
      };
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
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

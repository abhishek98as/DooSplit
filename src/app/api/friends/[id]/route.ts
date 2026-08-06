import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { notifyFriendAccepted, notifyFriendRemoved } from "@/lib/notificationService";
import { logFriendAdded, logFriendRemoved } from "@/lib/activity-logger";
import {
  deleteBidirectionalFriendship,
  getFriendshipStatus,
  getFriendshipPair,
  resolveFriendshipPairByAnyId,
  upsertBidirectionalFriendship,
} from "@/lib/social/friendship-store";
import { getUserById } from "@/lib/dynamodb/entities/users";
import { getFriendship } from "@/lib/dynamodb/entities/friendships";
import { listGroupsForUser, getGroupById } from "@/lib/dynamodb/entities/groups";
import {
  listExpenseIdsByParticipant,
  getExpensesByIds,
  listExpenseParticipants,
} from "@/lib/dynamodb/entities/expenses";
import { queryGroupSettlements } from "@/lib/dynamodb/entities/settlements";
import { computePairwiseBalancesForUserDynamo } from "@/lib/data/dynamodb-adapter";

export const dynamic = "force-dynamic";

function toNum(value: any): number {
  return Number(value || 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildTransfersForExpense(participants: any[]): Array<{ from: string; to: string; amount: number }> {
  const netMap = new Map<string, number>();
  for (const p of participants) {
    const uid = String(p.user_id || p.userId || "");
    if (!uid) continue;
    const net = toNum(p.amount_paid || p.paid_amount || 0) - toNum(p.amount_owed || p.owed_amount || 0);
    netMap.set(uid, round2((netMap.get(uid) || 0) + net));
  }
  const debtors: Array<{ userId: string; amount: number }> = [];
  const creditors: Array<{ userId: string; amount: number }> = [];
  for (const [uid, net] of netMap.entries()) {
    if (net < -0.01) debtors.push({ userId: uid, amount: round2(Math.abs(net)) });
    else if (net > 0.01) creditors.push({ userId: uid, amount: round2(net) });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const transfers: Array<{ from: string; to: string; amount: number }> = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settled = round2(Math.min(debtor.amount, creditor.amount));
    if (settled > 0.01) transfers.push({ from: debtor.userId, to: creditor.userId, amount: settled });
    debtor.amount = round2(debtor.amount - settled);
    creditor.amount = round2(creditor.amount - settled);
    if (debtor.amount <= 0.01) i++;
    if (creditor.amount <= 0.01) j++;
  }
  return transfers;
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

    const friendshipStatus = await getFriendshipStatus(userId, friendId);
    if (friendshipStatus.status !== "accepted") {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }
    const friendship = friendshipStatus.forward || friendshipStatus.reverse;

    const cacheKey = buildUserScopedCacheKey(
      "friend-details",
      userId,
      `${friendId}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      const f = await getFriendship(userId, friendId);
      if (!f || f.status !== "accepted") {
        throw new Error("Friend not found");
      }

      const friendUser = await getUserById(friendId);
      if (!friendUser) {
        throw new Error("Friend not found");
      }

      const balanceMap = await computePairwiseBalancesForUserDynamo(userId, [friendId]);
      const balance = balanceMap.get(friendId) || 0;

      const myMemberships = await listGroupsForUser(userId);
      const friendMemberships = await listGroupsForUser(friendId);
      const myGroupIds = new Set(myMemberships.map((m) => m.group_id));
      const commonGroupIds = friendMemberships
        .map((m) => m.group_id)
        .filter((gid) => myGroupIds.has(gid));

      let groupBreakdown: any[] = [];
      if (commonGroupIds.length > 0) {
        const friendExpenseRefs = await listExpenseIdsByParticipant(friendId);
        const friendExpenseIds = new Set(friendExpenseRefs.map((r) => r.expense_id));

        const myExpenseRefs = await listExpenseIdsByParticipant(userId);
        const pairExpenseIds = myExpenseRefs
          .map((r) => r.expense_id)
          .filter((eid) => friendExpenseIds.has(eid));

        let pairExpenses: any[] = [];
        if (pairExpenseIds.length > 0) {
          const expenses = await getExpensesByIds(pairExpenseIds);
          pairExpenses = expenses.filter((e) => e && !e.is_deleted);
        }

        const grouped = new Map<string, any[]>();
        for (const expense of pairExpenses) {
          if (!expense.group_id) continue;
          const list = grouped.get(expense.group_id) || [];
          list.push(expense);
          grouped.set(expense.group_id, list);
        }

        groupBreakdown = await Promise.all(
          commonGroupIds.map(async (groupId) => {
            const group = await getGroupById(groupId);
            if (!group) return null;

            const expenses = grouped.get(groupId) || [];
            let groupBalance = 0;
            let lastActivity: string | null = null;

            for (const expense of expenses) {
              const participants = await listExpenseParticipants(expense.id);
              const transfers = buildTransfersForExpense(participants);
              for (const transfer of transfers) {
                if (transfer.from === userId || transfer.to === userId) {
                  const otherUserId = transfer.from === userId ? transfer.to : transfer.from;
                  if (otherUserId !== friendId) continue;
                  const delta = transfer.to === userId ? transfer.amount : -transfer.amount;
                  groupBalance = round2(groupBalance + delta);
                }
              }

              const createdBy = expense.created_by;
              if (createdBy === userId || createdBy === friendId) {
                if (!lastActivity || new Date(expense.updated_at) > new Date(lastActivity)) {
                  lastActivity = expense.updated_at;
                }
              }
            }

            const { items: groupSettlements } = await queryGroupSettlements(groupId, 5000);
            const pairGroupSettlements = groupSettlements.filter(
              (s) =>
                !s.is_deleted &&
                ((s.from_user_id === userId && s.to_user_id === friendId) ||
                  (s.from_user_id === friendId && s.to_user_id === userId))
            );
            for (const settlement of pairGroupSettlements) {
              const amt = Number(settlement.amount || 0);
              if (settlement.from_user_id === userId) {
                groupBalance = round2(groupBalance + amt);
              } else {
                groupBalance = round2(groupBalance - amt);
              }
            }

            return {
              groupId,
              groupName: group.name,
              balance: round2(groupBalance),
              lastActivity,
            };
          })
        );
        groupBreakdown = groupBreakdown.filter(Boolean);
      }

      return {
        friend: {
          _id: friendUser.id,
          name: friendUser.name,
          email: friendUser.email,
          profilePicture: friendUser.photo_url || null,
          balance: round2(balance),
          friendsSince: friendship?.data.created_at || "",
        },
        groupBreakdown,
      };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    if (error.message === "Friend not found") {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }
    console.error("Friend details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend details" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;
    const body = await request.json();
    const action = String(body?.action || "");
    if (action !== "accept" && action !== "reject") {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    const resolved = await resolveFriendshipPairByAnyId(id);
    if (!resolved) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const directUserId = String(resolved.userId || "");
    const directFriendId = String(resolved.friendId || "");
    if (!directUserId || !directFriendId) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (directUserId !== currentUserId && directFriendId !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requesterId = directUserId === currentUserId ? directFriendId : directUserId;
    const pair = await getFriendshipPair(currentUserId, requesterId);
    const incomingEdge = pair.forward;
    if (!incomingEdge) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (String(incomingEdge.data.status || "") !== "pending") {
      return NextResponse.json(
        { error: "Request already handled" },
        { status: 400 }
      );
    }
    if (String(incomingEdge.data.requested_by || "") === currentUserId) {
      return NextResponse.json(
        { error: "Only incoming requests can be handled here" },
        { status: 403 }
      );
    }

    if (action === "accept") {
      await upsertBidirectionalFriendship({
        userId: currentUserId,
        friendId: requesterId,
        status: "accepted",
        requestedBy: requesterId,
      });

      let currentUserName = auth.user.name || "Someone";
      let requesterName = "Someone";

      try {
        const [u, r] = await Promise.all([
          getUserById(currentUserId),
          getUserById(requesterId),
        ]);
        currentUserName = u?.name || currentUserName;
        requesterName = r?.name || requesterName;

        await notifyFriendAccepted(
          {
            id: currentUserId,
            name: currentUserName,
          },
          requesterId
        );
      } catch (notifError) {
        console.error("Failed to send friend acceptance notification:", notifError);
      }

      void logFriendAdded({
        userId: currentUserId,
        userName: currentUserName,
        friendId: requesterId,
        friendName: requesterName,
      });

      await invalidateUsersCache(
        [currentUserId, requesterId],
        [
          "friends",
          "activities",
          "dashboard-activity",
          "friend-transactions",
          "friend-details",
          "analytics",
        ]
      );

      return NextResponse.json(
        { message: "Friend request accepted" },
        { status: 200 }
      );
    }

    await deleteBidirectionalFriendship(currentUserId, requesterId);

    await invalidateUsersCache(
      [currentUserId, requesterId],
      [
        "friends",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
        "analytics",
      ]
    );

    return NextResponse.json(
      { message: "Friend request rejected" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Handle friend request error:", error);
    return NextResponse.json(
      { error: "Failed to handle friend request" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;

    const resolved = await resolveFriendshipPairByAnyId(id);
    if (!resolved) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    const sourceUserId = String(resolved.userId || "");
    const sourceFriendId = String(resolved.friendId || "");
    if (!sourceUserId || !sourceFriendId) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }
    if (sourceUserId !== currentUserId && sourceFriendId !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const friendId =
      sourceUserId === currentUserId ? sourceFriendId : sourceUserId;

    let currentUserName = auth.user.name || "Someone";
    let friendName = "Someone";

    const [u, f] = await Promise.all([
      getUserById(currentUserId),
      getUserById(friendId),
    ]);
    currentUserName = u?.name || currentUserName;
    friendName = f?.name || friendName;

    await deleteBidirectionalFriendship(currentUserId, friendId);

    try {
      await notifyFriendRemoved(
        { id: currentUserId, name: currentUserName },
        friendId
      );
    } catch (notifError) {
      console.error("Failed to send friend removed notification:", notifError);
    }

    void logFriendRemoved({
      userId: currentUserId,
      userName: currentUserName,
      friendId,
      friendName,
    });

    await invalidateUsersCache(
      [currentUserId, friendId],
      [
        "friends",
        "expenses",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
        "user-balance",
        "settlements",
        "analytics",
      ]
    );

    return NextResponse.json(
      { message: "Friend removed successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Remove friend error:", error);
    return NextResponse.json(
      { error: "Failed to remove friend" },
      { status: 500 }
    );
  }
}

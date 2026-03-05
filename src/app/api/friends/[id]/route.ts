import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { notifyFriendAccepted } from "@/lib/notificationService";
import { getAdminDb } from "@/lib/firestore/admin";
import {
  deleteBidirectionalFriendship,
  getFriendshipStatus,
  getFriendshipPair,
  resolveFriendshipPairByAnyId,
  upsertBidirectionalFriendship,
} from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";

function toNum(value: any): number {
  return Number(value || 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function fetchDocsByIds(collection: string, ids: string[]): Promise<Map<string, any>> {
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const db = getAdminDb();
  const rows = new Map<string, any>();
  for (const idChunk of chunk(uniqueIds, 200)) {
    const refs = idChunk.map((id) => db.collection(collection).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        rows.set(doc.id, {
          id: doc.id,
          ...((doc.data() as any) || {}),
        });
      }
    }
  }

  return rows;
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
      const db = getAdminDb();
      const friendDoc = await db.collection("users").doc(friendId).get();
      if (!friendDoc.exists) {
        throw new Error("Friend not found");
      }
      const friend: any = {
        id: friendDoc.id,
        ...(friendDoc.data() || {}),
      };

      const pairParticipantsSnap = await db
        .collection("expense_participants")
        .where("user_id", "in", [userId, friendId])
        .get();
      const pairParticipants: any[] = pairParticipantsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      }));

      const participantsByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants) {
        const expenseId = String(participant.expense_id);
        const list = participantsByExpense.get(expenseId) || [];
        list.push(participant);
        participantsByExpense.set(expenseId, list);
      }

      const pairExpenseIds = Array.from(participantsByExpense.entries())
        .filter(([, entries]) => {
          const users = new Set(entries.map((entry) => String(entry.user_id)));
          return users.has(userId) && users.has(friendId);
        })
        .map(([expenseId]) => expenseId);

      let balance = 0;
      let groupBreakdown: Array<{
        groupId: string;
        groupName: string;
        balance: number;
        lastActivity: string | null;
      }> = [];

      // Transfer-based algorithm: build net maps per expense, then do greedy debtor-creditor matching
      function buildTransfersForExpense(participants: any[]): Array<{ from: string; to: string; amount: number }> {
        const netMap = new Map<string, number>();
        for (const p of participants) {
          const uid = String(p.user_id || "");
          if (!uid) continue;
          const net = toNum(p.paid_amount) - toNum(p.owed_amount);
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

      let pairExpenses: any[] = [];
      if (pairExpenseIds.length > 0) {
        const expensesById = await fetchDocsByIds("expenses", pairExpenseIds);
        for (const expenseId of pairExpenseIds) {
          const expense = expensesById.get(expenseId);
          if (expense && !expense.is_deleted) {
            pairExpenses.push(expense);
          }
        }

        // Use transfer-based algorithm (consistent with balance-service.ts)
        for (const expense of pairExpenses) {
          const participants = participantsByExpense.get(String(expense.id)) || [];
          const transfers = buildTransfersForExpense(participants);
          for (const transfer of transfers) {
            if (transfer.from === userId || transfer.to === userId) {
              const otherUserId = transfer.from === userId ? transfer.to : transfer.from;
              if (otherUserId !== friendId) continue;
              // positive balance = friend owes user
              const delta = transfer.to === userId ? transfer.amount : -transfer.amount;
              balance = round2(balance + delta);
            }
          }
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
      const settlements: any[] = [
        ...outgoingSettlementsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
        ...incomingSettlementsSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
      ];

      // Bug 1 fix: correct settlement sign convention
      // from === userId means user paid friend → user's debt decreases → balance improves (moves positive)
      // from === friendId means friend paid user → friend's debt decreases → balance decreases
      for (const settlement of settlements) {
        const amount = toNum(settlement.amount);
        if (String(settlement.from_user_id) === userId) {
          balance = round2(balance + amount); // user paid friend: debt cleared, balance improves
        } else {
          balance = round2(balance - amount); // friend paid user: friend's debt cleared, balance decreases
        }
      }

      const [userMembershipsSnap, friendMembershipsSnap] = await Promise.all([
        db.collection("group_members").where("user_id", "==", userId).get(),
        db.collection("group_members").where("user_id", "==", friendId).get(),
      ]);
      const userMemberships = userMembershipsSnap.docs.map((doc) => doc.data() || {});
      const friendMemberships = friendMembershipsSnap.docs.map((doc) => doc.data() || {});

      const userGroupIds = new Set(userMemberships.map((row: any) => String(row.group_id)));
      const commonGroupIds = uniqueStrings(
        friendMemberships
          .map((row: any) => String(row.group_id))
          .filter((groupId: string) => userGroupIds.has(groupId))
      );

      if (commonGroupIds.length > 0) {
        const groupsById = await fetchDocsByIds("groups", commonGroupIds);

        const grouped = new Map<string, any[]>();
        for (const expense of pairExpenses) {
          if (!expense.group_id) {
            continue;
          }
          const key = String(expense.group_id);
          const list = grouped.get(key) || [];
          list.push(expense);
          grouped.set(key, list);
        }

        groupBreakdown = await Promise.all(
          commonGroupIds
            .map((groupId) => groupsById.get(groupId))
            .filter(Boolean)
            .map(async (group: any) => {
              const expenses = grouped.get(String(group.id)) || [];
              let groupBalance = 0;
              let lastActivity: string | null = null;

              // Use transfer-based algorithm for group balance breakdown (Bug 3 fix)
              for (const expense of expenses) {
                const participants = participantsByExpense.get(String(expense.id)) || [];
                const transfers = buildTransfersForExpense(participants);
                for (const transfer of transfers) {
                  if (transfer.from === userId || transfer.to === userId) {
                    const otherUserId = transfer.from === userId ? transfer.to : transfer.from;
                    if (otherUserId !== friendId) continue;
                    const delta = transfer.to === userId ? transfer.amount : -transfer.amount;
                    groupBalance = round2(groupBalance + delta);
                  }
                }

                const createdBy = String(expense.created_by || "");
                if (createdBy === userId || createdBy === friendId) {
                  if (!lastActivity || new Date(expense.updated_at) > new Date(lastActivity)) {
                    lastActivity = expense.updated_at;
                  }
                }
              }

              // Bug 5 fix: include group settlements in group breakdown
              const [outGroupSnap, inGroupSnap] = await Promise.all([
                db.collection("settlements").where("from_user_id", "==", userId).where("to_user_id", "==", friendId).where("group_id", "==", String(group.id)).get(),
                db.collection("settlements").where("from_user_id", "==", friendId).where("to_user_id", "==", userId).where("group_id", "==", String(group.id)).get(),
              ]);
              const groupSettlements: any[] = [
                ...outGroupSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
                ...inGroupSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) })),
              ];
              for (const settlement of groupSettlements) {
                const amount = toNum(settlement.amount);
                if (String(settlement.from_user_id) === userId) {
                  groupBalance = round2(groupBalance + amount);
                } else {
                  groupBalance = round2(groupBalance - amount);
                }
              }

              return {
                groupId: String(group.id),
                groupName: String(group.name),
                balance: round2(groupBalance),
                lastActivity,
              };
            })
        );
      }

      return {
        friend: {
          _id: friend.id,
          name: friend.name,
          email: friend.email,
          profilePicture: friend.profile_picture || null,
          balance: round2(balance),
          friendsSince: String(friendship?.data.created_at || ""),
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

      try {
        const db = getAdminDb();
        const userDoc = await db.collection("users").doc(currentUserId).get();
        await notifyFriendAccepted(
          {
            id: currentUserId,
            name: String(userDoc.data()?.name || auth.user.name || "Someone"),
          },
          requesterId
        );
      } catch (notifError) {
        console.error("Failed to send friend acceptance notification:", notifError);
      }

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
    await deleteBidirectionalFriendship(currentUserId, friendId);

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


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

      let pairExpenses: any[] = [];
      if (pairExpenseIds.length > 0) {
        const expensesById = await fetchDocsByIds("expenses", pairExpenseIds);
        for (const expenseId of pairExpenseIds) {
          const expense = expensesById.get(expenseId);
          if (expense && !expense.is_deleted) {
            pairExpenses.push(expense);
          }
        }

        for (const expense of pairExpenses) {
          const participants = participantsByExpense.get(String(expense.id)) || [];
          const friendParticipant = participants.find(
            (participant: any) => String(participant.user_id) === friendId
          );
          if (!friendParticipant) {
            continue;
          }
          const friendNet =
            toNum(friendParticipant.paid_amount) - toNum(friendParticipant.owed_amount);
          balance = round2(balance - friendNet);
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

      for (const settlement of settlements) {
        if (String(settlement.from_user_id) === userId) {
          balance = round2(balance - toNum(settlement.amount));
        } else {
          balance = round2(balance + toNum(settlement.amount));
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

        groupBreakdown = commonGroupIds
          .map((groupId) => groupsById.get(groupId))
          .filter(Boolean)
          .map((group: any) => {
          const expenses = grouped.get(String(group.id)) || [];
          let groupBalance = 0;
          let lastActivity: string | null = null;

          for (const expense of expenses) {
            const participants = participantsByExpense.get(String(expense.id)) || [];
            const friendParticipant = participants.find(
              (participant: any) => String(participant.user_id) === friendId
            );
            if (friendParticipant) {
              const friendNet =
                toNum(friendParticipant.paid_amount) - toNum(friendParticipant.owed_amount);
              groupBalance = round2(groupBalance - friendNet);
            }

            const createdBy = String(expense.created_by || "");
            if (createdBy === userId || createdBy === friendId) {
              if (!lastActivity || new Date(expense.updated_at) > new Date(lastActivity)) {
                lastActivity = expense.updated_at;
              }
            }
          }

          return {
            groupId: String(group.id),
            groupName: String(group.name),
            balance: round2(groupBalance),
            lastActivity,
          };
        });
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


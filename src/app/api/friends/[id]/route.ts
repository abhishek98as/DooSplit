import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { notifyFriendAccepted } from "@/lib/notificationService";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function toNum(value: any): number {
  return Number(value || 0);
}

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
      .select("id,created_at")
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
      `${friendId}:${request.nextUrl.search}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.activities, async () => {
      const { data: friend, error: friendError } = await supabase
        .from("users")
        .select("id,name,email,profile_picture,created_at")
        .eq("id", friendId)
        .maybeSingle();
      if (friendError) {
        throw friendError;
      }
      if (!friend) {
        throw new Error("Friend not found");
      }

      const { data: pairParticipants, error: participantsError } = await supabase
        .from("expense_participants")
        .select("expense_id,user_id,paid_amount,owed_amount")
        .in("user_id", [userId, friendId]);
      if (participantsError) {
        throw participantsError;
      }

      const participantsByExpense = new Map<string, any[]>();
      for (const participant of pairParticipants || []) {
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
        const { data: expenses, error: expensesError } = await supabase
          .from("expenses")
          .select("id,group_id,created_by,updated_at,is_deleted")
          .in("id", pairExpenseIds)
          .eq("is_deleted", false);
        if (expensesError) {
          throw expensesError;
        }
        pairExpenses = expenses || [];

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

      const { data: settlements, error: settlementsError } = await supabase
        .from("settlements")
        .select("from_user_id,to_user_id,amount")
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
        );
      if (settlementsError) {
        throw settlementsError;
      }

      for (const settlement of settlements || []) {
        if (String(settlement.from_user_id) === userId) {
          balance = round2(balance - toNum(settlement.amount));
        } else {
          balance = round2(balance + toNum(settlement.amount));
        }
      }

      const { data: userMemberships, error: userGroupsError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);
      if (userGroupsError) {
        throw userGroupsError;
      }
      const { data: friendMemberships, error: friendGroupsError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", friendId);
      if (friendGroupsError) {
        throw friendGroupsError;
      }

      const userGroupIds = new Set((userMemberships || []).map((row: any) => String(row.group_id)));
      const commonGroupIds = (friendMemberships || [])
        .map((row: any) => String(row.group_id))
        .filter((groupId) => userGroupIds.has(groupId));

      if (commonGroupIds.length > 0) {
        const { data: groups, error: groupsError } = await supabase
          .from("groups")
          .select("id,name")
          .in("id", commonGroupIds);
        if (groupsError) {
          throw groupsError;
        }

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

        groupBreakdown = (groups || []).map((group: any) => {
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
          friendsSince: friendship.created_at,
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

    const supabase = requireSupabaseAdmin();
    const { data: friendship, error: friendshipError } = await supabase
      .from("friendships")
      .select("id,user_id,friend_id,status,requested_by")
      .eq("id", id)
      .maybeSingle();
    if (friendshipError) {
      throw friendshipError;
    }
    if (!friendship) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (String(friendship.user_id) !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (String(friendship.status) !== "pending") {
      return NextResponse.json(
        { error: "Request already handled" },
        { status: 400 }
      );
    }

    const requesterId = String(friendship.friend_id);
    const nowIso = new Date().toISOString();

    if (action === "accept") {
      const { error: forwardError } = await supabase
        .from("friendships")
        .update({ status: "accepted", updated_at: nowIso })
        .eq("user_id", currentUserId)
        .eq("friend_id", requesterId);
      if (forwardError) {
        throw forwardError;
      }
      const { error: reverseError } = await supabase
        .from("friendships")
        .update({ status: "accepted", updated_at: nowIso })
        .eq("user_id", requesterId)
        .eq("friend_id", currentUserId);
      if (reverseError) {
        throw reverseError;
      }

      try {
        const { data: userRow } = await supabase
          .from("users")
          .select("id,name")
          .eq("id", currentUserId)
          .maybeSingle();
        await notifyFriendAccepted(
          { id: currentUserId, name: userRow?.name || "Someone" },
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

    const { error: deleteError } = await supabase
      .from("friendships")
      .delete()
      .or(
        `and(user_id.eq.${currentUserId},friend_id.eq.${requesterId}),and(user_id.eq.${requesterId},friend_id.eq.${currentUserId})`
      );
    if (deleteError) {
      throw deleteError;
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
    const supabase = requireSupabaseAdmin();

    const { data: friendship, error: friendshipError } = await supabase
      .from("friendships")
      .select("id,user_id,friend_id")
      .eq("id", id)
      .maybeSingle();
    if (friendshipError) {
      throw friendshipError;
    }
    if (!friendship) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }
    if (String(friendship.user_id) !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const friendId = String(friendship.friend_id);
    const { error: deleteError } = await supabase
      .from("friendships")
      .delete()
      .or(
        `and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`
      );
    if (deleteError) {
      throw deleteError;
    }

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

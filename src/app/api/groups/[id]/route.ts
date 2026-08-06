import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { computeGroupMemberNetBalances } from "@/lib/data/balance-service";
import { round2, uniqueStrings } from "@/lib/firestore/route-helpers";
import { GROUP_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logGroupDeleted } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

async function loadGroupPayload(
  groupId: string,
  userId: string
): Promise<{ group: any; memberIds: string[] }> {
  const { getGroupById, getGroupMember, listGroupMembers } = await import(
    "@/lib/dynamodb/entities/groups"
  );
  const { getUsersByIds } = await import("@/lib/dynamodb/entities/users");

  const membership = await getGroupMember(groupId, userId);
  if (!membership) {
    throw new Error("Forbidden");
  }

  const group = await getGroupById(groupId);
  if (!group || group.is_active === false) {
    throw new Error("Group not found");
  }

  const members = await listGroupMembers(groupId);
  const userIds = uniqueStrings([
    String(group.created_by || ""),
    ...members.map((member) => String(member.user_id || "")),
  ]);

  const ddbUsers = await getUsersByIds(userIds);
  const usersMap = new Map<string, (typeof ddbUsers)[number]>();
  for (const u of ddbUsers) {
    if (u) usersMap.set(u.id, u);
  }

  const payloadMembers = members.map((member) => {
    const user = usersMap.get(String(member.user_id || ""));
    return {
      _id: `${groupId}_${member.user_id}`,
      groupId: member.group_id,
      userId: user
        ? {
            _id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone_number || null,
            profilePicture: user.photo_url || null,
            isDummy: Boolean(user.is_dummy),
            isRegistered: !user.is_dummy,
          }
        : null,
      role: member.role || "member",
      joinedAt: member.joined_at,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    };
  });

  const memberIds = uniqueStrings(
    payloadMembers.map((member) => String(member.userId?._id || ""))
  );

  // Fail loudly — never pretend balances are settled (₹0) on compute errors
  let balances: Array<{ userId: string; userName: string; balance: number }> = [];
  let balancesError = false;
  try {
    const balanceMap = await computeGroupMemberNetBalances(groupId);
    balances = memberIds.map((memberId) => {
      const memberUser = usersMap.get(memberId);
      return {
        userId: memberId,
        userName: memberUser?.name || "Unknown",
        balance: round2(balanceMap.get(memberId) || 0),
      };
    });
  } catch (err) {
    console.error(`Failed to compute balances for group ${groupId}:`, err);
    balancesError = true;
    balances = [];
  }

  const creator = usersMap.get(String(group.created_by || ""));
  return {
    group: {
      _id: group.id,
      name: group.name,
      description: group.description || "",
      image: group.image || null,
      type: group.type || "trip",
      currency: group.currency || "INR",
      createdBy: creator
        ? {
            _id: creator.id,
            name: creator.name,
            email: creator.email,
            profilePicture: creator.photo_url || null,
          }
        : null,
      isActive: true,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      members: payloadMembers,
      memberCount: payloadMembers.length,
      userRole: membership.role || "member",
      balances,
      balancesError,
      myBalance: balancesError
        ? null
        : round2(
            balances.find((b) => b.userId === userId)?.balance ?? 0
          ),
      settleUpDate: group.settle_up_date || null,
      notes: group.notes || "",
      simplifyDebts: group.simplify_debts !== false,
      settleUpRemindersEnabled: Boolean(group.settle_up_reminders_enabled),
      defaultSplit: group.default_split || null,
    },
    memberIds,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const cacheKey = buildUserScopedCacheKey("groups", userId, `detail:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.groups, async () => {
      const { group } = await loadGroupPayload(id, userId);
      return { group };
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error.message === "Group not found") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    console.error("Get group error:", error);
    return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const { getGroupMember, updateGroup } = await import(
      "@/lib/dynamodb/entities/groups"
    );
    const membership = await getGroupMember(id, userId);
    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can update group details" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updatePayload: Record<string, unknown> = {};
    if (body?.name !== undefined) updatePayload.name = String(body.name).trim();
    if (body?.description !== undefined) {
      updatePayload.description = body.description ? String(body.description) : "";
    }
    if (body?.image !== undefined) {
      updatePayload.image = body.image ? String(body.image) : null;
    }
    if (body?.type !== undefined) updatePayload.type = String(body.type);
    if (body?.currency !== undefined) updatePayload.currency = String(body.currency);
    if (body?.settleUpDate !== undefined) {
      updatePayload.settle_up_date = body.settleUpDate
        ? String(body.settleUpDate)
        : null;
    }
    if (body?.notes !== undefined) updatePayload.notes = String(body.notes).trim();
    if (body?.simplifyDebts !== undefined) {
      updatePayload.simplify_debts = Boolean(body.simplifyDebts);
    }
    if (body?.settleUpRemindersEnabled !== undefined) {
      updatePayload.settle_up_reminders_enabled = Boolean(body.settleUpRemindersEnabled);
    }
    if (body?.defaultSplit !== undefined) {
      updatePayload.default_split = body.defaultSplit
        ? {
            payerId: body.defaultSplit.payerId
              ? String(body.defaultSplit.payerId)
              : undefined,
            method: body.defaultSplit.method
              ? String(body.defaultSplit.method)
              : "equally",
          }
        : null;
    }
    updatePayload.updated_at = new Date().toISOString();

    await updateGroup(id, updatePayload as any);
    const { group, memberIds } = await loadGroupPayload(id, userId);

    await invalidateUsersCache(Array.from(new Set([userId, ...memberIds])), [
      ...GROUP_MUTATION_CACHE_SCOPES,
    ]);

    return NextResponse.json(
      { message: "Group updated successfully", group },
      {
        status: 200,
        headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) },
      }
    );
  } catch (error: any) {
    console.error("Update group error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update group" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const { getGroupMember, getGroupById, updateGroup, listGroupMembers } =
      await import("@/lib/dynamodb/entities/groups");
    const { queryGroupExpenseFeed } = await import(
      "@/lib/dynamodb/entities/expenses"
    );

    const membership = await getGroupMember(id, userId);
    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can delete the group" },
        { status: 403 }
      );
    }

    const group = await getGroupById(id);
    if (!group || group.is_active === false) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { items: groupExpenses } = await queryGroupExpenseFeed(id, 1);
    if (groupExpenses.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete group with existing expenses. Delete all expenses first.",
        },
        { status: 400 }
      );
    }

    const members = await listGroupMembers(id);
    const memberIds = members.map((m) => m.user_id);

    await updateGroup(id, {
      is_active: false,
      updated_at: new Date().toISOString(),
    });

    const affectedUserIds = Array.from(new Set([userId, ...memberIds]));

    void logGroupDeleted({
      actorId: userId,
      actorName: auth.user.name || "Someone",
      groupId: id,
      groupName: group.name || "Untitled Group",
      memberIds: affectedUserIds,
    });

    await invalidateUsersCache(affectedUserIds, [...GROUP_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      { message: "Group deleted successfully" },
      {
        status: 200,
        headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) },
      }
    );
  } catch (error: any) {
    console.error("Delete group error:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}

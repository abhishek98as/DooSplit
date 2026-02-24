import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { computeGroupMemberNetBalances } from "@/lib/data/balance-service";
import { fetchDocsByIds, mapUser, round2, toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { GROUP_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

async function loadGroupPayload(
  groupId: string,
  userId: string
): Promise<{ group: any; memberIds: string[] }> {
  const db = getAdminDb();
  const membershipSnap = await db
    .collection("group_members")
    .where("group_id", "==", groupId)
    .where("user_id", "==", userId)
    .limit(1)
    .get();
  if (membershipSnap.empty) {
    throw new Error("Forbidden");
  }
  const membership = membershipSnap.docs[0].data() || {};

  const groupDoc = await db.collection("groups").doc(groupId).get();
  if (!groupDoc.exists || groupDoc.data()?.is_active === false) {
    throw new Error("Group not found");
  }
  const group: any = { id: groupDoc.id, ...((groupDoc.data() as any) || {}) };

  const membersSnap = await db
    .collection("group_members")
    .where("group_id", "==", groupId)
    .get();
  const members = membersSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));

  const userIds = uniqueStrings([
    String(group.created_by || ""),
    ...members.map((member: any) => String(member.user_id || "")),
  ]);
  const usersMap = await fetchDocsByIds("users", userIds);

  const payloadMembers = members.map((member: any) => {
    const user = usersMap.get(String(member.user_id || ""));
    return {
      _id: String(member.id || ""),
      groupId: String(member.group_id || ""),
      userId: user ? mapUser(user) : null,
      role: String(member.role || "member"),
      joinedAt: toIso(member.joined_at || member.created_at || member._created_at),
      createdAt: toIso(member.created_at || member._created_at),
      updatedAt: toIso(member.updated_at || member._updated_at),
    };
  });

  const memberIds = uniqueStrings(
    payloadMembers.map((member: any) => String(member.userId?._id || ""))
  );

  let balances: Array<{ userId: string; userName: string; balance: number }> = [];
  try {
    const balanceMap = await computeGroupMemberNetBalances(groupId, memberIds);
    balances = memberIds.map((memberId) => {
      const memberUser = usersMap.get(memberId);
      const memberName =
        String(memberUser?.name || "").trim() ||
        payloadMembers.find((member: any) => String(member.userId?._id) === memberId)?.userId
          ?.name ||
        "Unknown";
      return {
        userId: memberId,
        userName: memberName,
        balance: round2(balanceMap.get(memberId) || 0),
      };
    });
  } catch (balanceError) {
    console.error("Failed to compute group balances:", balanceError);
    balances = memberIds.map((memberId) => {
      const memberUser = usersMap.get(memberId);
      return {
        userId: memberId,
        userName: String(memberUser?.name || "Unknown"),
        balance: 0,
      };
    });
  }

  const creator = usersMap.get(String(group.created_by || ""));
  return {
    group: {
      _id: String(group.id || ""),
      name: String(group.name || ""),
      description: String(group.description || ""),
      image: group.image || null,
      type: String(group.type || "trip"),
      currency: String(group.currency || "INR"),
      createdBy: creator ? mapUser(creator) : null,
      isActive: group.is_active !== false,
      createdAt: toIso(group.created_at || group._created_at),
      updatedAt: toIso(group.updated_at || group._updated_at),
      members: payloadMembers,
      memberCount: payloadMembers.length,
      userRole: String(membership.role || "member"),
      balances,
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
    return NextResponse.json(
      { error: "Failed to fetch group" },
      { status: 500 }
    );
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
    const db = getAdminDb();

    const membershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", userId)
      .where("role", "==", "admin")
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      return NextResponse.json(
        { error: "Only group admins can update group details" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updatePayload: Record<string, any> = {};
    if (body?.name !== undefined) {
      updatePayload.name = String(body.name).trim();
    }
    if (body?.description !== undefined) {
      updatePayload.description = body.description ? String(body.description) : "";
    }
    if (body?.image !== undefined) {
      updatePayload.image = body.image ? String(body.image) : null;
    }
    if (body?.type !== undefined) {
      updatePayload.type = String(body.type);
    }
    if (body?.currency !== undefined) {
      updatePayload.currency = String(body.currency);
    }
    updatePayload.updated_at = new Date().toISOString();
    updatePayload._updated_at = FieldValue.serverTimestamp();

    const groupRef = db.collection("groups").doc(id);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists || groupDoc.data()?.is_active === false) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    await groupRef.set(updatePayload, { merge: true });
    const { group, memberIds } = await loadGroupPayload(id, userId);

    await invalidateUsersCache(
      Array.from(new Set([userId, ...memberIds])),
      [...GROUP_MUTATION_CACHE_SCOPES]
    );

    return NextResponse.json(
      {
        message: "Group updated successfully",
        group,
      },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
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
    const db = getAdminDb();

    const membershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", userId)
      .where("role", "==", "admin")
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      return NextResponse.json(
        { error: "Only group admins can delete the group" },
        { status: 403 }
      );
    }

    const unsettledExpensesSnap = await db
      .collection("expenses")
      .where("group_id", "==", id)
      .where("is_deleted", "==", false)
      .limit(1)
      .get();
    if (!unsettledExpensesSnap.empty) {
      return NextResponse.json(
        {
          error:
            "Cannot delete group with existing expenses. Delete all expenses first.",
        },
        { status: 400 }
      );
    }

    const membersSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .get();
    const memberIds = membersSnap.docs.map((doc) => String(doc.data()?.user_id || ""));

    await db.collection("groups").doc(id).set(
      {
        is_active: false,
        updated_at: new Date().toISOString(),
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const affectedUserIds = Array.from(new Set([userId, ...memberIds]));

    await invalidateUsersCache(affectedUserIds, [...GROUP_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      { message: "Group deleted successfully" },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Delete group error:", error);
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    );
  }
}


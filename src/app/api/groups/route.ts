import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveRepository } from "@/lib/data";
import { createGroupInDynamo } from "@/lib/dynamodb/write-operations";
import { newAppId } from "@/lib/ids";
import { logGroupCreated } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const cacheKey = buildUserScopedCacheKey(
      "groups",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.groups,
      async () => {
        const repository = await getActiveRepository();
        return repository.getGroups({
          userId,
          requestSearch: request.nextUrl.search,
        });
      }
    );

    return NextResponse.json(payload, {
      headers: {
        "X-Cache-Status": cacheStatus,
        "X-Response-Time": `${Date.now() - routeStart}ms`,
      },
    });
  } catch (error: any) {
    console.error("Fetch groups error:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { name, description, image, type, currency, memberIds } = body || {};

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const dedupMembers = Array.from(
      new Set(
        (Array.isArray(memberIds) ? memberIds : [])
          .map((id: any) => String(id))
          .filter((id: string) => id && id !== userId)
      )
    );

    const allMemberIds = [userId, ...dedupMembers];

    const groupId = newAppId();
    const nowIso = new Date().toISOString();
    await createGroupInDynamo({
      group: {
        id: groupId,
        name: String(name).trim(),
        description: description || "",
        image: image || null,
        type: type || "trip",
        currency: currency || "INR",
        created_by: userId,
        is_active: true,
        member_count: allMemberIds.length,
        created_at: nowIso,
        updated_at: nowIso,
      },
      members: allMemberIds.map((memberId) => ({
        group_id: groupId,
        user_id: memberId,
        role: memberId === userId ? "admin" : "member",
        status: "active",
        joined_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })),
    });

    const { getGroupById, listGroupMembers } = await import(
      "@/lib/dynamodb/entities/groups"
    );
    const [g, m] = await Promise.all([
      getGroupById(groupId),
      listGroupMembers(groupId),
    ]);
    const groupRow: any = g || {};
    const members = m.map((row) => ({
      _id: `${groupId}_${row.user_id}`,
      groupId: row.group_id,
      userId: row.user_id,
      role: row.role || "member",
      joinedAt: row.joined_at,
    }));

    void logGroupCreated({
      actorId: userId,
      actorName: auth.user.name || "Someone",
      groupId,
      groupName: String(groupRow.name || name || "Untitled Group"),
      memberIds: allMemberIds,
    });

    await invalidateUsersCache(
      Array.from(new Set(allMemberIds)),
      ["groups", "activities", "dashboard-activity", "analytics"]
    );

    return NextResponse.json({
      success: true,
      groupId,
      group: {
        _id: groupId,
        name: String(groupRow.name || name),
        description: String(groupRow.description || description || ""),
        image: groupRow.image || null,
        type: String(groupRow.type || type || "trip"),
        currency: String(groupRow.currency || currency || "INR"),
        memberCount: members.length,
        userRole: "admin",
        members,
      },
      message: "Group created successfully",
    });
  } catch (error: any) {
    console.error("Create group error:", error);
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}

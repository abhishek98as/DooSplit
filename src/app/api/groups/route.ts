import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { createGroupInFirestore } from "@/lib/firestore/write-operations";
import { getAdminDb } from "@/lib/firestore/admin";

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
      async () =>
        firestoreReadRepository.getGroups({
          userId,
          requestSearch: request.nextUrl.search,
        })
    );

    return NextResponse.json(payload, {
      headers: {
        "X-Cache-Status": cacheStatus,
        "X-Response-Time": `${Date.now() - routeStart}ms`,
      },
    });
  } catch (error: any) {
    console.error("Fetch groups error:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
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

    const groupData = {
      name: String(name).trim(),
      description: description || "",
      image: image || null,
      type: type || "trip",
      currency: currency || "INR",
      created_by: userId,
      is_active: true,
    };

    const groupId = await createGroupInFirestore(groupData, allMemberIds);
    const db = getAdminDb();

    const [groupDoc, membersSnap] = await Promise.all([
      db.collection("groups").doc(groupId).get(),
      db.collection("group_members").where("group_id", "==", groupId).get(),
    ]);

    const groupRow = groupDoc.exists ? groupDoc.data() || {} : {};
    const members = membersSnap.docs.map((doc) => {
      const row = doc.data() || {};
      return {
        _id: doc.id,
        groupId: String(row.group_id || groupId),
        userId: String(row.user_id || ""),
        role: String(row.role || "member"),
        joinedAt:
          typeof row.joined_at?.toDate === "function"
            ? row.joined_at.toDate().toISOString()
            : row.joined_at || new Date().toISOString(),
      };
    });

    await invalidateUsersCache(
      Array.from(new Set(allMemberIds)),
      ["groups", "activities", "dashboard-activity", "analytics"]
    );

    // Return success response
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

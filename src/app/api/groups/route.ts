import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { supabaseReadRepository } from "@/lib/data/supabase-adapter";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

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
        supabaseReadRepository.getGroups({
          userId,
          requestSearch: request.nextUrl.search,
        })
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Cache": cacheStatus,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Get groups error:", error);
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

    const supabase = requireSupabaseAdmin();
    const groupId = newAppId();
    const nowIso = new Date().toISOString();

    const { data: groupRow, error: groupError } = await supabase
      .from("groups")
      .insert({
        id: groupId,
        name: String(name).trim(),
        description: description || "",
        image: image || null,
        type: type || "trip",
        currency: currency || "INR",
        created_by: userId,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (groupError || !groupRow) {
      throw groupError || new Error("Failed to create group");
    }

    const dedupMembers = Array.from(
      new Set(
        (Array.isArray(memberIds) ? memberIds : [])
          .map((id: any) => String(id))
          .filter((id: string) => id && id !== userId)
      )
    );

    const memberRows = [
      {
        id: newAppId(),
        group_id: groupId,
        user_id: userId,
        role: "admin",
        joined_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      },
      ...dedupMembers.map((id) => ({
        id: newAppId(),
        group_id: groupId,
        user_id: id,
        role: "member",
        joined_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })),
    ];

    const { error: membersInsertError } = await supabase
      .from("group_members")
      .insert(memberRows);
    if (membersInsertError) {
      throw membersInsertError;
    }

    const { data: members, error: membersError } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId);
    if (membersError) {
      throw membersError;
    }

    const userIds = Array.from(
      new Set((members || []).map((member: any) => String(member.user_id)))
    );
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", userIds);
    if (usersError) {
      throw usersError;
    }
    const usersMap = new Map((users || []).map((user: any) => [String(user.id), user]));

    const createdByUser = usersMap.get(userId);
    const hydratedMembers = (members || []).map((member: any) => {
      const user = usersMap.get(String(member.user_id));
      return {
        _id: member.id,
        groupId: member.group_id,
        userId: user
          ? {
              _id: user.id,
              name: user.name,
              email: user.email,
              profilePicture: user.profile_picture || null,
            }
          : null,
        role: member.role,
        joinedAt: member.joined_at,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
      };
    });

    await invalidateUsersCache(
      Array.from(new Set([userId, ...dedupMembers])),
      [
        "groups",
        "expenses",
        "activities",
        "dashboard-activity",
        "friend-details",
        "user-balance",
      ]
    );

    return NextResponse.json(
      {
        message: "Group created successfully",
        group: {
          _id: groupRow.id,
          name: groupRow.name,
          description: groupRow.description,
          image: groupRow.image,
          type: groupRow.type,
          currency: groupRow.currency,
          createdBy: createdByUser
            ? {
                _id: createdByUser.id,
                name: createdByUser.name,
                email: createdByUser.email,
                profilePicture: createdByUser.profile_picture || null,
              }
            : null,
          isActive: groupRow.is_active,
          createdAt: groupRow.created_at,
          updatedAt: groupRow.updated_at,
          members: hydratedMembers,
          memberCount: hydratedMembers.length,
          userRole: "admin",
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create group error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create group" },
      { status: 500 }
    );
  }
}

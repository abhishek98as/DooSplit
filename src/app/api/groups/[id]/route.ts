import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

async function loadGroupPayload(
  groupId: string,
  userId: string
): Promise<{ group: any; memberIds: string[] }> {
  const supabase = requireSupabaseAdmin();

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) {
    throw membershipError;
  }
  if (!membership) {
    throw new Error("Forbidden");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (groupError) {
    throw groupError;
  }
  if (!group) {
    throw new Error("Group not found");
  }

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId);
  if (membersError) {
    throw membersError;
  }

  const userIds = Array.from(
    new Set([
      String(group.created_by),
      ...(members || []).map((member: any) => String(member.user_id)),
    ])
  );
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id,name,email,profile_picture")
    .in("id", userIds);
  if (usersError) {
    throw usersError;
  }
  const usersMap = new Map((users || []).map((u: any) => [String(u.id), u]));

  const payloadMembers = (members || []).map((member: any) => {
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

  const creator = usersMap.get(String(group.created_by));
  return {
    group: {
      _id: group.id,
      name: group.name,
      description: group.description,
      image: group.image,
      type: group.type,
      currency: group.currency,
      createdBy: creator
        ? {
            _id: creator.id,
            name: creator.name,
            email: creator.email,
            profilePicture: creator.profile_picture || null,
          }
        : null,
      isActive: group.is_active,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      members: payloadMembers,
      memberCount: payloadMembers.length,
      userRole: membership.role,
    },
    memberIds: Array.from(
      new Set(payloadMembers.map((member: any) => String(member.userId?._id)).filter(Boolean))
    ),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    return NextResponse.json(payload, { status: 200 });
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
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) {
      throw membershipError;
    }
    if (!membership || membership.role !== "admin") {
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

    const { data: updatedRow, error: updateError } = await supabase
      .from("groups")
      .update(updatePayload)
      .eq("id", id)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();
    if (updateError) {
      throw updateError;
    }
    if (!updatedRow) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { group, memberIds } = await loadGroupPayload(id, userId);

    await invalidateUsersCache(
      Array.from(new Set([userId, ...memberIds])),
      ["groups", "activities", "dashboard-activity", "analytics"]
    );

    return NextResponse.json(
      {
        message: "Group updated successfully",
        group,
      },
      { status: 200 }
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
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) {
      throw membershipError;
    }
    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can delete the group" },
        { status: 403 }
      );
    }

    const { count: unsettledExpenses, error: expenseCountError } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("group_id", id)
      .eq("is_deleted", false);
    if (expenseCountError) {
      throw expenseCountError;
    }
    if ((unsettledExpenses || 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete group with existing expenses. Delete all expenses first.",
        },
        { status: 400 }
      );
    }

    const { data: members, error: memberError } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", id);
    if (memberError) {
      throw memberError;
    }

    const { error: deactivateError } = await supabase
      .from("groups")
      .update({ is_active: false })
      .eq("id", id);
    if (deactivateError) {
      throw deactivateError;
    }

    const affectedUserIds = Array.from(
      new Set([userId, ...(members || []).map((member: any) => String(member.user_id))])
    );

    await invalidateUsersCache(affectedUserIds, [
      "groups",
      "expenses",
      "activities",
      "dashboard-activity",
      "friend-details",
      "user-balance",
      "analytics",
    ]);

    return NextResponse.json(
      { message: "Group deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Delete group error:", error);
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    );
  }
}

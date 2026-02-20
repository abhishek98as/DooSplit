import { NextRequest, NextResponse } from "next/server";
import { invalidateUsersCache } from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";
import { groupMemberDocId } from "@/lib/social/keys";

function mapMembers(members: any[], usersMap: Map<string, any>) {
  return members.map((member: any) => {
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
}

async function loadGroupMembers(groupId: string) {
  const supabase = requireSupabaseAdmin();
  const { data: members, error } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId);
  if (error) {
    throw error;
  }
  const userIds = Array.from(
    new Set((members || []).map((member: any) => String(member.user_id)))
  );
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id,name,email,profile_picture")
    .in("id", userIds.length > 0 ? userIds : ["__none__"]);
  if (usersError) {
    throw usersError;
  }
  const usersMap = new Map<string, any>((users || []).map((user: any) => [String(user.id), user]));
  return mapMembers(members || [], usersMap);
}

export async function POST(
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
    const newMemberId = String(body?.userId || "");
    if (!newMemberId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (membershipError) {
      throw membershipError;
    }
    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can add members" },
        { status: 403 }
      );
    }

    const { data: userExists, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", newMemberId)
      .maybeSingle();
    if (userError) {
      throw userError;
    }
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: existingMember, error: existingError } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", newMemberId)
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (existingMember?.id) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { error: insertError } = await supabase.from("group_members").insert({
      id: groupMemberDocId(id, newMemberId),
      group_id: id,
      user_id: newMemberId,
      role: "member",
      joined_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insertError) {
      throw insertError;
    }

    const members = await loadGroupMembers(id);
    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        newMemberId,
        ...members.map((member: any) => String(member.userId?._id)).filter(Boolean),
      ])
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
      {
        message: "Member added successfully",
        members,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Add member error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add member" },
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

    const searchUserId = request.nextUrl.searchParams.get("userId");
    let bodyUserId: string | null = null;
    try {
      const body = await request.json();
      bodyUserId = body?.userId ? String(body.userId) : null;
    } catch {
      bodyUserId = null;
    }
    const memberIdToRemove = searchUserId || bodyUserId;
    if (!memberIdToRemove) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (membershipError) {
      throw membershipError;
    }
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isSelfRemoval = memberIdToRemove === currentUserId;
    const isAdmin = membership.role === "admin";
    if (!isSelfRemoval && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can remove other members" },
        { status: 403 }
      );
    }

    if (isAdmin && isSelfRemoval) {
      const { count: adminCount, error: adminCountError } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", id)
        .eq("role", "admin");
      if (adminCountError) {
        throw adminCountError;
      }
      if ((adminCount || 0) <= 1) {
        return NextResponse.json(
          {
            error:
              "Cannot leave group as the only admin. Promote another member first.",
          },
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", id)
      .eq("user_id", memberIdToRemove);
    if (deleteError) {
      throw deleteError;
    }

    const members = await loadGroupMembers(id);
    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        memberIdToRemove,
        ...members.map((member: any) => String(member.userId?._id)).filter(Boolean),
      ])
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
      {
        message: "Member removed successfully",
        members,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}


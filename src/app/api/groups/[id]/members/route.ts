import { NextRequest, NextResponse } from "next/server";
import { invalidateUsersCache } from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity-logger";
import { toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { GROUP_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import {
  listGroupMembers,
  getGroupMember,
  putGroupMember,
  getGroupById,
} from "@/lib/dynamodb/entities/groups";
import { getUsersByIds, getUserById } from "@/lib/dynamodb/entities/users";
import { getDynamoDB } from "@/lib/dynamodb/client";
import { TABLE } from "@/lib/dynamodb/tables";
import { PK, SK } from "@/lib/dynamodb/keys";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

function mapMembers(members: any[], usersMap: Map<string, any>) {
  return members.map((member: any) => {
    const user = usersMap.get(String(member.user_id || ""));
    return {
      _id: member.id || `${member.group_id}_${member.user_id}`,
      groupId: String(member.group_id || ""),
      userId: user ? {
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone_number || user.phone || null,
        profilePicture: user.photo_url || user.profile_picture || null,
        isDummy: Boolean(user.is_dummy),
        isRegistered: !user.is_dummy,
      } : null,
      role: String(member.role || "member"),
      joinedAt: toIso(member.joined_at || member.created_at || member._created_at),
      createdAt: toIso(member.created_at || member._created_at),
      updatedAt: toIso(member.updated_at || member._updated_at),
    };
  });
}

async function loadGroupMembers(groupId: string) {
  const members = await listGroupMembers(groupId);
  const userIds = uniqueStrings(members.map((member: any) => String(member.user_id || "")));
  const ddbUsers = await getUsersByIds(userIds);
  const usersMap = new Map<string, any>();
  for (const u of ddbUsers) {
    if (u) {
      usersMap.set(u.id, u);
    }
  }
  return mapMembers(members, usersMap);
}

export async function POST(
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
    const currentUserId = auth.user.id;

    const body = await request.json();
    const newMemberId = String(body?.userId || "");
    if (!newMemberId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const adminMembership = await getGroupMember(id, currentUserId);
    if (!adminMembership || adminMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can add members" },
        { status: 403 }
      );
    }

    const userExists = await getUserById(newMemberId);
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const newMemberName = userExists.name || "a member";

    const existingMember = await getGroupMember(id, newMemberId);
    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    await putGroupMember({
      group_id: id,
      user_id: newMemberId,
      role: "member",
      status: "active",
      joined_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const members = await loadGroupMembers(id);
    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        newMemberId,
        ...members.map((member: any) => String(member.userId?._id)).filter(Boolean),
      ])
    );

    const group = await getGroupById(id);
    const groupName = group?.name || "Group";

    void logActivity({
      userIds: affectedUserIds,
      actorId: currentUserId,
      actorName: auth.user.name || "Someone",
      type: "group_member_added",
      title: "Member Added",
      description: `${auth.user.name || "Someone"} added ${newMemberName} to "${groupName}"`,
      metadata: {
        groupId: id,
        groupName,
        memberId: newMemberId,
        memberName: newMemberName,
      },
    });

    await invalidateUsersCache(affectedUserIds, [...GROUP_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      {
        message: "Member added successfully",
        members,
      },
      {
        status: 201,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
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
    const routeStart = Date.now();
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

    const membership = await getGroupMember(id, currentUserId);
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
      const members = await listGroupMembers(id);
      const adminCount = members.filter((m) => m.role === "admin").length;
      if (adminCount <= 1) {
        return NextResponse.json(
          {
            error: "Cannot leave group as the only admin. Promote another member first.",
          },
          { status: 400 }
        );
      }
    }

    await getDynamoDB().send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.group(id), SK: SK.member(memberIdToRemove) },
    }));

    const members = await loadGroupMembers(id);
    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        memberIdToRemove,
        ...members.map((member: any) => String(member.userId?._id)).filter(Boolean),
      ])
    );

    await invalidateUsersCache(affectedUserIds, [...GROUP_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      {
        message: "Member removed successfully",
        members,
      },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}

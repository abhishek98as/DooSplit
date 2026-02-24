import { NextRequest, NextResponse } from "next/server";
import { invalidateUsersCache } from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { groupMemberDocId } from "@/lib/social/keys";
import { fetchDocsByIds, mapUser, toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { GROUP_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";

function mapMembers(members: any[], usersMap: Map<string, any>) {
  return members.map((member: any) => {
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
}

async function loadGroupMembers(groupId: string) {
  const db = getAdminDb();
  const membersSnap = await db
    .collection("group_members")
    .where("group_id", "==", groupId)
    .get();
  const members = membersSnap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));
  const userIds = uniqueStrings((members || []).map((member: any) => String(member.user_id || "")));
  const usersMap = await fetchDocsByIds("users", userIds);
  return mapMembers(members || [], usersMap);
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

    const db = getAdminDb();
    const adminMembershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", currentUserId)
      .where("role", "==", "admin")
      .limit(1)
      .get();
    if (adminMembershipSnap.empty) {
      return NextResponse.json(
        { error: "Only group admins can add members" },
        { status: 403 }
      );
    }

    const userExists = await db.collection("users").doc(newMemberId).get();
    if (!userExists.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingMemberSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", newMemberId)
      .limit(1)
      .get();
    if (!existingMemberSnap.empty) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const memberId = groupMemberDocId(id, newMemberId);
    await db.collection("group_members").doc(memberId).set({
      id: memberId,
      group_id: id,
      user_id: newMemberId,
      role: "member",
      joined_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      _created_at: FieldValue.serverTimestamp(),
      _updated_at: FieldValue.serverTimestamp(),
    });

    const members = await loadGroupMembers(id);
    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        newMemberId,
        ...members.map((member: any) => String(member.userId?._id)).filter(Boolean),
      ])
    );

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

    const db = getAdminDb();
    const membershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", currentUserId)
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const membership = membershipSnap.docs[0].data() || {};

    const isSelfRemoval = memberIdToRemove === currentUserId;
    const isAdmin = String(membership.role || "") === "admin";
    if (!isSelfRemoval && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can remove other members" },
        { status: 403 }
      );
    }

    if (isAdmin && isSelfRemoval) {
      const adminCountSnap = await db
        .collection("group_members")
        .where("group_id", "==", id)
        .where("role", "==", "admin")
        .get();
      if (adminCountSnap.size <= 1) {
        return NextResponse.json(
          {
            error:
              "Cannot leave group as the only admin. Promote another member first.",
          },
          { status: 400 }
        );
      }
    }

    const targetMembershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", memberIdToRemove)
      .limit(1)
      .get();
    if (!targetMembershipSnap.empty) {
      await targetMembershipSnap.docs[0].ref.delete();
    }

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


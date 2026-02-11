import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import {
  mirrorUpsertToSupabase,
  readWithMode,
} from "@/lib/data";
import { mongoReadRepository, supabaseReadRepository } from "@/lib/data/read-routing";

export const dynamic = 'force-dynamic';

// GET /api/groups - List groups
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = buildUserScopedCacheKey(
      "groups",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.groups,
      async () => {
        return readWithMode({
          routeName: "/api/groups",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getGroups({
              userId: session.user.id,
              requestSearch: request.nextUrl.search,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getGroups({
              userId: session.user.id,
              requestSearch: request.nextUrl.search,
            }),
        });
      }
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
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create group
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, image, type, currency, memberIds } = body;

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Create group
    const group = await Group.create({
      name,
      description: description || "",
      image: image || null,
      type: type || "trip",
      currency: currency || "INR",
      createdBy: userId,
      isActive: true,
    });

    // Add creator as admin
    await GroupMember.create({
      groupId: group._id,
      userId,
      role: "admin",
    });

    // Add other members
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
    const memberDocs = memberIds
        .filter((id: string) => id !== userId.toString())
        .map((id: string) => ({
          groupId: group._id,
          userId: new mongoose.Types.ObjectId(id),
          role: "member",
        }));

      if (memberDocs.length > 0) {
        await GroupMember.insertMany(memberDocs);
      }
    }

    await mirrorUpsertToSupabase("groups", group._id.toString(), {
      id: group._id.toString(),
      name: group.name,
      description: group.description || null,
      image: group.image || null,
      type: group.type,
      currency: group.currency,
      created_by: userId.toString(),
      is_active: group.isActive !== false,
      created_at: group.createdAt,
      updated_at: group.updatedAt,
    });

    const allMembers = await GroupMember.find({ groupId: group._id }).lean();
    for (const member of allMembers as any[]) {
      await mirrorUpsertToSupabase("group_members", member._id.toString(), {
        id: member._id.toString(),
        group_id: member.groupId.toString(),
        user_id: member.userId.toString(),
        role: member.role || "member",
        joined_at: member.joinedAt || member.createdAt,
        created_at: member.createdAt,
        updated_at: member.updatedAt,
      });
    }

    const populatedGroup = await Group.findById(group._id).populate(
      "createdBy",
      "name email profilePicture"
    );

    const members = await GroupMember.find({ groupId: group._id }).populate(
      "userId",
      "name email profilePicture"
    );

    const affectedUserIds = Array.from(
      new Set(
        [
          session.user.id,
          ...(memberIds && Array.isArray(memberIds) ? memberIds.map((id: string) => id) : []),
        ].filter(Boolean)
      )
    );

    await invalidateUsersCache(affectedUserIds, [
      "groups",
      "expenses",
      "activities",
      "dashboard-activity",
      "friend-details",
      "user-balance",
    ]);

    return NextResponse.json(
      {
        message: "Group created successfully",
        group: {
          ...populatedGroup!.toJSON(),
          members,
          memberCount: members.length,
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

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
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";

export const dynamic = 'force-dynamic';

// GET /api/groups - List groups
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);
    const cacheKey = buildUserScopedCacheKey(
      "groups",
      session.user.id,
      request.nextUrl.search
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.groups, async () => {
      // Find groups where user is a member
      const memberRecords = await GroupMember.find({ userId })
        .select("groupId role")
        .lean();
      const groupIds = memberRecords.map((m: any) => m.groupId);

      if (groupIds.length === 0) {
        return { groups: [] };
      }

      const groups = await Group.find({
        _id: { $in: groupIds },
        isActive: true,
      })
        .populate("createdBy", "name email profilePicture")
        .sort({ createdAt: -1 })
        .lean();

      const members = await GroupMember.find({
        groupId: { $in: groups.map((group) => group._id) },
      })
        .populate("userId", "name email profilePicture")
        .lean();

      const membersByGroup = new Map<string, any[]>();
      for (const member of members) {
        const key = member.groupId.toString();
        const list = membersByGroup.get(key) || [];
        list.push(member);
        membersByGroup.set(key, list);
      }

      const roleByGroup = new Map(
        memberRecords.map((member: any) => [member.groupId.toString(), member.role])
      );

      const groupsWithDetails = groups.map((group) => {
        const groupMembers = membersByGroup.get(group._id.toString()) || [];

        return {
          ...group,
          memberCount: groupMembers.length,
          members: groupMembers,
          userRole: roleByGroup.get(group._id.toString()) || "member",
        };
      });

      return { groups: groupsWithDetails };
    });

    return NextResponse.json(payload, { status: 200 });
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


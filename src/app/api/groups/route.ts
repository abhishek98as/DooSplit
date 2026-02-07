import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

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

    // Find groups where user is a member
    const memberRecords = await GroupMember.find({ userId }).select("groupId role");
    const groupIds = memberRecords.map((m) => m.groupId);

    const groups = await Group.find({
      _id: { $in: groupIds },
      isActive: true,
    })
      .populate("createdBy", "name email profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    // Add member count and user role to each group
    const groupsWithDetails = await Promise.all(
      groups.map(async (group) => {
        const members = await GroupMember.find({ groupId: group._id }).populate(
          "userId",
          "name email profilePicture"
        );
        
        const userMember = memberRecords.find(
          (m) => m.groupId.toString() === group._id.toString()
        );

        return {
          ...group,
          memberCount: members.length,
          members,
          userRole: userMember?.role || "member",
        };
      })
    );

    return NextResponse.json({ groups: groupsWithDetails }, { status: 200 });
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


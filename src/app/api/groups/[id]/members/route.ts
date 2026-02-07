import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import User from "@/models/User";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// POST /api/groups/[id]/members - Add member to group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userId: newMemberId } = body;

    if (!newMemberId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if requester is admin
    const membership = await GroupMember.findOne({
      groupId: id,
      userId,
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can add members" },
        { status: 403 }
      );
    }

    // Check if user exists
    const userExists = await User.findById(newMemberId);
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already a member
    const existingMember = await GroupMember.findOne({
      groupId: id,
      userId: newMemberId,
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Add member
    await GroupMember.create({
      groupId: id,
      userId: new mongoose.Types.ObjectId(newMemberId),
      role: "member",
    });

    const members = await GroupMember.find({ groupId: id }).populate(
      "userId",
      "name email profilePicture"
    );

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

// DELETE /api/groups/[id]/members - Remove member from group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const memberIdToRemove = searchParams.get("userId");

    if (!memberIdToRemove) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if requester is admin or removing themselves
    const membership = await GroupMember.findOne({
      groupId: id,
      userId,
    });

    const isSelfRemoval = memberIdToRemove === userId.toString();
    const isAdmin = membership?.role === "admin";

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isSelfRemoval && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can remove other members" },
        { status: 403 }
      );
    }

    // Check if user is the only admin
    if (isAdmin && isSelfRemoval) {
      const adminCount = await GroupMember.countDocuments({
        groupId: id,
        role: "admin",
      });

      if (adminCount === 1) {
        return NextResponse.json(
          {
            error:
              "Cannot leave group as the only admin. Promote another member first.",
          },
          { status: 400 }
        );
      }
    }

    await GroupMember.findOneAndDelete({
      groupId: id,
      userId: memberIdToRemove,
    });

    const members = await GroupMember.find({ groupId: id }).populate(
      "userId",
      "name email profilePicture"
    );

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

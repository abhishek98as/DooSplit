import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Expense from "@/models/Expense";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// GET /api/groups/[id] - Get single group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const group = await Group.findOne({
      _id: id,
      isActive: true,
    }).populate("createdBy", "name email profilePicture");

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is a member
    const membership = await GroupMember.findOne({
      groupId: group._id,
      userId,
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await GroupMember.find({ groupId: group._id }).populate(
      "userId",
      "name email profilePicture"
    );

    return NextResponse.json(
      {
        group: {
          ...group.toJSON(),
          members,
          memberCount: members.length,
          userRole: membership.role,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get group error:", error);
    return NextResponse.json(
      { error: "Failed to fetch group" },
      { status: 500 }
    );
  }
}

// PUT /api/groups/[id] - Update group
export async function PUT(
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
    const { name, description, image, type, currency } = body;

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is admin
    const membership = await GroupMember.findOne({
      groupId: id,
      userId,
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can update group details" },
        { status: 403 }
      );
    }

    const group = await Group.findByIdAndUpdate(
      id,
      {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(type && { type }),
        ...(currency && { currency }),
      },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email profilePicture");

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const members = await GroupMember.find({ groupId: group._id }).populate(
      "userId",
      "name email profilePicture"
    );

    return NextResponse.json(
      {
        message: "Group updated successfully",
        group: {
          ...group.toJSON(),
          members,
          memberCount: members.length,
          userRole: membership.role,
        },
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

// DELETE /api/groups/[id] - Delete group (soft delete)
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

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is admin
    const membership = await GroupMember.findOne({
      groupId: id,
      userId,
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only group admins can delete the group" },
        { status: 403 }
      );
    }

    // Check if there are unsettled expenses
    const unsettledExpenses = await Expense.countDocuments({
      groupId: id,
      isDeleted: false,
    });

    if (unsettledExpenses > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete group with existing expenses. Delete all expenses first.",
        },
        { status: 400 }
      );
    }

    await Group.findByIdAndUpdate(id, { isActive: false });

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

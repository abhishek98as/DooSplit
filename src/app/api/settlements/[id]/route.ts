import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Settlement from "@/models/Settlement";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// GET /api/settlements/[id] - Get single settlement
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const settlement = await Settlement.findById(params.id)
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .populate("groupId", "name image");

    if (!settlement) {
      return NextResponse.json(
        { error: "Settlement not found" },
        { status: 404 }
      );
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is involved in settlement
    if (
      settlement.fromUserId._id.toString() !== userId.toString() &&
      settlement.toUserId._id.toString() !== userId.toString()
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ settlement }, { status: 200 });
  } catch (error: any) {
    console.error("Get settlement error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlement" },
      { status: 500 }
    );
  }
}

// DELETE /api/settlements/[id] - Delete settlement
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const settlement = await Settlement.findById(params.id);

    if (!settlement) {
      return NextResponse.json(
        { error: "Settlement not found" },
        { status: 404 }
      );
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Only sender can delete settlement
    if (settlement.fromUserId.toString() !== userId.toString()) {
      return NextResponse.json(
        { error: "Only settlement sender can delete" },
        { status: 403 }
      );
    }

    await Settlement.findByIdAndDelete(params.id);

    return NextResponse.json(
      { message: "Settlement deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Delete settlement error:", error);
    return NextResponse.json(
      { error: "Failed to delete settlement" },
      { status: 500 }
    );
  }
}

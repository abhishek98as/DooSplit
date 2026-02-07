import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // "accept" or "reject"

    if (!action || !["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'accept' or 'reject'" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find the friendship where current user is the receiver
    const friendship = await Friend.findOne({
      _id: params.id,
      userId,
      status: "pending",
    });

    if (!friendship) {
      return NextResponse.json(
        { error: "Friend request not found" },
        { status: 404 }
      );
    }

    // Check if current user is NOT the one who sent the request
    if (friendship.requestedBy.toString() === session.user.id) {
      return NextResponse.json(
        { error: "You cannot accept your own friend request" },
        { status: 400 }
      );
    }

    if (action === "accept") {
      // Update both entries to accepted
      await Friend.updateMany(
        {
          $or: [
            { userId, friendId: friendship.friendId },
            { userId: friendship.friendId, friendId: userId },
          ],
        },
        { status: "accepted" }
      );

      return NextResponse.json(
        { message: "Friend request accepted" },
        { status: 200 }
      );
    } else {
      // Delete both entries
      await Friend.deleteMany({
        $or: [
          { userId, friendId: friendship.friendId },
          { userId: friendship.friendId, friendId: userId },
        ],
      });

      return NextResponse.json(
        { message: "Friend request rejected" },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error("Update friend request error:", error);
    return NextResponse.json(
      { error: "Failed to update friend request" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import { notifyFriendAccepted } from "@/lib/notificationService";
import mongoose from "mongoose";
import User from "@/models/User";

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
      _id: id,
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

      // Send notification to the requester
      try {
        const accepter = await User.findById(userId).select("name");
        await notifyFriendAccepted(
          { id: userId, name: accepter?.name || "Someone" },
          friendship.requestedBy
        );
      } catch (notifError) {
        console.error("Failed to send notification:", notifError);
      }

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

// DELETE /api/friends/[id] - Remove a friend
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

    // Find the friendship
    const friendship = await Friend.findOne({
      _id: id,
      $or: [{ userId }, { friendId: userId }],
    });

    if (!friendship) {
      return NextResponse.json(
        { error: "Friendship not found" },
        { status: 404 }
      );
    }

    // Delete both directions of the friendship
    await Friend.deleteMany({
      $or: [
        { userId: friendship.userId, friendId: friendship.friendId },
        { userId: friendship.friendId, friendId: friendship.userId },
      ],
    });

    return NextResponse.json(
      { message: "Friend removed successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Remove friend error:", error);
    return NextResponse.json(
      { error: "Failed to remove friend" },
      { status: 500 }
    );
  }
}

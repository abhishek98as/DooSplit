import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find pending requests where current user is the receiver
    const pendingRequests = await Friend.find({
      userId,
      status: "pending",
      requestedBy: { $ne: userId },
    }).populate("friendId", "name email profilePicture");

    const requests = pendingRequests.map((req: any) => ({
      id: req._id,
      from: {
        id: req.friendId._id,
        name: req.friendId.name,
        email: req.friendId.email,
        profilePicture: req.friendId.profilePicture,
      },
      createdAt: req.createdAt,
    }));

    return NextResponse.json({ requests }, { status: 200 });
  } catch (error: any) {
    console.error("Get pending requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    );
  }
}


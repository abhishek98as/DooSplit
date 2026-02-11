import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import User from "@/models/User";
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

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || searchParams.get("query");

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Search users by name or email (case-insensitive), exclude dummy users
    const users = await User.find({
      $and: [
        { _id: { $ne: userId } }, // Exclude current user
        { isDummy: { $ne: true } }, // Exclude dummy users
        {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
          ],
        },
      ],
      isActive: true,
    })
      .select("name email profilePicture")
      .limit(10)
      .lean();

    // Batch friendship lookup (fixes N+1 — single query instead of 1 per user)
    const userIds = users.map((u: any) => u._id);
    const friendships = await Friend.find({
      userId,
      friendId: { $in: userIds },
    })
      .select("friendId status")
      .lean();

    const friendshipMap = new Map(
      friendships.map((f: any) => [f.friendId.toString(), f.status])
    );

    const usersWithStatus = users.map((user: any) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      friendshipStatus: friendshipMap.get(user._id.toString()) || "none",
    }));

    return NextResponse.json({ users: usersWithStatus }, { status: 200 });
  } catch (error: any) {
    console.error("Search users error:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}


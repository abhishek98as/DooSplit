import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import User from "@/models/User";
import { authOptions } from "@/lib/auth";
import { notifyFriendRequest } from "@/lib/notificationService";
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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/friends - List all friends
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = buildUserScopedCacheKey(
      "friends",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.friends,
      async () => {
        return readWithMode({
          routeName: "/api/friends",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getFriends({
              userId: session.user.id,
              requestSearch: request.nextUrl.search,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getFriends({
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
    console.error("Get friends error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friends", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/friends - Send friend request OR create dummy friend
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, userId: friendUserId, dummyName } = body;

    await dbConnect();

    const currentUserId = new mongoose.Types.ObjectId(session.user.id);

    // --- CREATE DUMMY FRIEND ---
    if (dummyName) {
      const trimmedName = dummyName.trim();
      if (!trimmedName || trimmedName.length < 1) {
        return NextResponse.json(
          { error: "Name is required for dummy friend" },
          { status: 400 }
        );
      }

      // Generate a unique placeholder email for the dummy user
      const dummyEmail = `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@placeholder.doosplit`;

      // Create the dummy user
      const dummyUser = await User.create({
        name: trimmedName,
        email: dummyEmail,
        password: "dummy_no_login",
        isDummy: true,
        createdBy: currentUserId,
        isActive: true,
      });

      // Auto-create accepted friendship
      const createdFriendships = await Friend.insertMany([
        {
          userId: currentUserId,
          friendId: dummyUser._id,
          status: "accepted",
          requestedBy: currentUserId,
        },
        {
          userId: dummyUser._id,
          friendId: currentUserId,
          status: "accepted",
          requestedBy: currentUserId,
        },
      ]);

      await mirrorUpsertToSupabase("users", dummyUser._id.toString(), {
        id: dummyUser._id.toString(),
        email: String(dummyUser.email || "").toLowerCase(),
        password: dummyUser.password || null,
        name: dummyUser.name,
        profile_picture: dummyUser.profilePicture || null,
        default_currency: dummyUser.defaultCurrency || "INR",
        timezone: dummyUser.timezone || "Asia/Kolkata",
        language: dummyUser.language || "en",
        is_active: dummyUser.isActive !== false,
        is_dummy: !!dummyUser.isDummy,
        created_by: currentUserId.toString(),
        role: dummyUser.role === "admin" ? "admin" : "user",
        email_verified: !!dummyUser.emailVerified,
        auth_provider: dummyUser.authProvider === "firebase" ? "firebase" : "email",
        created_at: dummyUser.createdAt,
        updated_at: dummyUser.updatedAt,
      });

      const outgoingId = createdFriendships[0]._id.toString();
      const incomingId = createdFriendships[1]._id.toString();

      await mirrorUpsertToSupabase("friendships", outgoingId, {
        id: outgoingId,
        user_id: currentUserId.toString(),
        friend_id: dummyUser._id.toString(),
        status: "accepted",
        requested_by: currentUserId.toString(),
      });
      await mirrorUpsertToSupabase("friendships", incomingId, {
        id: incomingId,
        user_id: dummyUser._id.toString(),
        friend_id: currentUserId.toString(),
        status: "accepted",
        requested_by: currentUserId.toString(),
      });

      await invalidateUsersCache(
        [session.user.id, dummyUser._id.toString()],
        [
          "friends",
          "activities",
          "dashboard-activity",
          "friend-transactions",
          "friend-details",
        ]
      );

      return NextResponse.json(
        {
          message: `Dummy friend "${trimmedName}" created successfully`,
          friendship: {
            friend: {
              id: dummyUser._id,
              name: dummyUser.name,
              email: dummyUser.email,
              isDummy: true,
            },
          },
        },
        { status: 201 }
      );
    }

    // --- SEND FRIEND REQUEST ---
    let friendUser;

    // Find friend by email or userId
    if (email) {
      friendUser = await User.findOne({
        email: email.toLowerCase(),
        isDummy: { $ne: true },
      });
    } else if (friendUserId) {
      friendUser = await User.findById(friendUserId);
    }

    if (!friendUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (friendUser._id.toString() === session.user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend" },
        { status: 400 }
      );
    }

    // Check if friendship already exists
    const existingFriendship = await Friend.findOne({
      $or: [
        { userId: currentUserId, friendId: friendUser._id },
        { userId: friendUser._id, friendId: currentUserId },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === "accepted") {
        return NextResponse.json({ error: "Already friends" }, { status: 400 });
      }
      if (existingFriendship.status === "pending") {
        return NextResponse.json(
          { error: "Friend request already sent" },
          { status: 400 }
        );
      }
    }

    // Create friend request (bidirectional)
    const friendship = await Friend.create({
      userId: currentUserId,
      friendId: friendUser._id,
      status: "pending",
      requestedBy: currentUserId,
    });

    // Create reverse entry
    const reverseFriendship = await Friend.create({
      userId: friendUser._id,
      friendId: currentUserId,
      status: "pending",
      requestedBy: currentUserId,
    });

    await mirrorUpsertToSupabase("friendships", friendship._id.toString(), {
      id: friendship._id.toString(),
      user_id: currentUserId.toString(),
      friend_id: friendUser._id.toString(),
      status: "pending",
      requested_by: currentUserId.toString(),
      created_at: friendship.createdAt,
      updated_at: friendship.updatedAt,
    });
    await mirrorUpsertToSupabase("friendships", reverseFriendship._id.toString(), {
      id: reverseFriendship._id.toString(),
      user_id: friendUser._id.toString(),
      friend_id: currentUserId.toString(),
      status: "pending",
      requested_by: currentUserId.toString(),
      created_at: reverseFriendship.createdAt,
      updated_at: reverseFriendship.updatedAt,
    });

    // Send notification to the friend
    try {
      const currentUser = await User.findById(currentUserId).select("name");
      await notifyFriendRequest(
        { id: currentUserId, name: currentUser?.name || "Someone" },
        friendUser._id
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    await invalidateUsersCache(
      [session.user.id, friendUser._id.toString()],
      [
        "friends",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
      ]
    );

    return NextResponse.json(
      {
        message: "Friend request sent successfully",
        friendship: {
          id: friendship._id,
          friend: {
            id: friendUser._id,
            name: friendUser.name,
            email: friendUser.email,
          },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Send friend request error:", error);
    return NextResponse.json(
      { error: "Failed to send friend request" },
      { status: 500 }
    );
  }
}

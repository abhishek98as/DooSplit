import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { getActiveRepository } from "@/lib/data";
import { getServerFirebaseUser } from "@/lib/auth/firebase-session";
import { newAppId } from "@/lib/ids";
import { notifyFriendRequest } from "@/lib/notificationService";
import { logFriendAdded } from "@/lib/activity-logger";
import { normalizeEmail, normalizeName } from "@/lib/social/keys";
import {
  getFriendshipStatus,
  upsertBidirectionalFriendship,
} from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FRIEND_CACHE_SCOPES = [
  "friends",
  "groups",
  "activities",
  "dashboard-activity",
  "friend-transactions",
  "friend-details",
  "user-balance",
  "settlements",
  "analytics",
];

async function findUserByEmail(email: string) {
  const { getUserByEmail } = await import("@/lib/dynamodb/entities/users");
  const lowered = normalizeEmail(email) || email.toLowerCase().trim();
  return getUserByEmail(lowered);
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const user = await getServerFirebaseUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const cacheKey = buildUserScopedCacheKey(
      "friends",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.friends,
      async () => {
        const repository = await getActiveRepository();
        return repository.getFriends({
          userId,
          requestSearch: request.nextUrl.search,
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

export async function POST(request: NextRequest) {
  try {
    const user = await getServerFirebaseUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const body = await request.json();
    const { email, userId: friendUserId, dummyName } = body || {};

    if (dummyName) {
      const trimmedName = String(dummyName).trim();
      if (!trimmedName) {
        return NextResponse.json(
          { error: "Name is required for dummy friend" },
          { status: 400 }
        );
      }

      const dummyId = newAppId();
      const dummyEmail = `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@placeholder.doosplit`;
      const nowIso = new Date().toISOString();

      const { listDummiesCreatedByUser, putUser } = await import(
        "@/lib/dynamodb/entities/users"
      );
      const existingDummies = await listDummiesCreatedByUser(userId);
      const duplicate = existingDummies.find(
        (d) => String(d.name || "").trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return NextResponse.json(
          { error: "A dummy friend with this name already exists" },
          { status: 409 }
        );
      }

      await putUser({
        id: dummyId,
        name: trimmedName,
        name_normalized: normalizeName(trimmedName),
        email: dummyEmail,
        email_normalized: normalizeEmail(dummyEmail),
        is_dummy: true,
        created_by: userId,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

      await upsertBidirectionalFriendship({
        userId,
        friendId: dummyId,
        status: "accepted",
        requestedBy: userId,
      });

      void logFriendAdded({
        userId,
        userName: user.name || "You",
        friendId: dummyId,
        friendName: trimmedName,
      });

      await invalidateUsersCache([userId, dummyId], FRIEND_CACHE_SCOPES);

      return NextResponse.json(
        {
          message: `Dummy friend "${trimmedName}" created successfully`,
          friendship: {
            friend: {
              id: dummyId,
              name: trimmedName,
              email: dummyEmail,
              isDummy: true,
            },
          },
        },
        { status: 201 }
      );
    }

    const targetUserId = String(friendUserId || "").trim();
    const targetEmail = normalizeEmail(email);
    if (!targetUserId && !targetEmail) {
      return NextResponse.json(
        { error: "Provide a valid userId or email" },
        { status: 400 }
      );
    }

    const { getUserById } = await import("@/lib/dynamodb/entities/users");
    let friendUser: any = null;
    if (targetUserId) {
      friendUser = await getUserById(targetUserId);
    } else if (targetEmail) {
      friendUser = await findUserByEmail(targetEmail);
    }

    if (!friendUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (String(friendUser.id) === userId) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend" },
        { status: 400 }
      );
    }

    const friendId = String(friendUser.id);
    const statusResult = await getFriendshipStatus(userId, friendId);
    const existingStatus = statusResult.status;

    if (existingStatus === "accepted") {
      return NextResponse.json(
        { error: "You are already friends with this user" },
        { status: 409 }
      );
    }

    if (existingStatus === "pending") {
      return NextResponse.json(
        { error: "A friend request is already pending for this user" },
        { status: 409 }
      );
    }

    const friendshipWrite = await upsertBidirectionalFriendship({
      userId,
      friendId,
      status: "pending",
      requestedBy: userId,
    });
    const friendshipId = friendshipWrite.forwardId;

    try {
      await notifyFriendRequest(
        { id: userId, name: user.name || "Someone" },
        friendId
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    await invalidateUsersCache([userId, friendId], FRIEND_CACHE_SCOPES);

    return NextResponse.json(
      {
        message: "Friend request sent successfully",
        friendshipId,
        friendship: {
          friend: {
            id: friendId,
            name: friendUser.name,
            email: friendUser.email,
            profilePicture: friendUser.photo_url || null,
          },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Add friend error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add friend" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { getServerFirebaseUser } from "@/lib/auth/firebase-session";
import { newAppId } from "@/lib/ids";
import { notifyFriendRequest } from "@/lib/notificationService";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
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
  const db = getAdminDb();
  const lowered = normalizeEmail(email);
  if (!lowered) {
    return null;
  }

  const snap = await db
    .collection("users")
    .where("email_normalized", "==", lowered)
    .limit(1)
    .get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    return { id: doc.id, ...((doc.data() as any) || {}) };
  }

  const fallback = await db
    .collection("users")
    .where("email", "==", String(email).trim())
    .limit(1)
    .get();
  if (fallback.empty) {
    return null;
  }

  const doc = fallback.docs[0];
  return { id: doc.id, ...((doc.data() as any) || {}) };
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
      async () =>
        firestoreReadRepository.getFriends({
          userId,
          requestSearch: request.nextUrl.search,
        })
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
    const db = getAdminDb();

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

      const existingDummySnap = await db
        .collection("users")
        .where("created_by", "==", userId)
        .where("is_dummy", "==", true)
        .limit(200)
        .get();
      const existingDummy = existingDummySnap.docs.find((doc) => {
        const row = doc.data() || {};
        return String(row.name || "").trim().toLowerCase() === trimmedName.toLowerCase();
      });
      if (existingDummy) {
        return NextResponse.json(
          { error: "A dummy friend with this name already exists" },
          { status: 409 }
        );
      }

      await db.collection("users").doc(dummyId).set({
        id: dummyId,
        name: trimmedName,
        name_normalized: normalizeName(trimmedName),
        email: dummyEmail,
        email_normalized: normalizeEmail(dummyEmail),
        is_dummy: true,
        created_by: userId,
        role: "user",
        is_active: true,
        auth_provider: "dummy",
        email_verified: false,
        default_currency: "INR",
        timezone: "Asia/Kolkata",
        language: "en",
        push_notifications_enabled: false,
        email_notifications_enabled: false,
        created_at: nowIso,
        updated_at: nowIso,
        _created_at: FieldValue.serverTimestamp(),
        _updated_at: FieldValue.serverTimestamp(),
      });

      await upsertBidirectionalFriendship({
        userId,
        friendId: dummyId,
        status: "accepted",
        requestedBy: userId,
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

    let friendUser: any = null;
    if (targetUserId) {
      const targetDoc = await db.collection("users").doc(targetUserId).get();
      if (targetDoc.exists) {
        friendUser = { id: targetDoc.id, ...(targetDoc.data() || {}) };
      }
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
        {
          id: userId,
          name: user.name || "Someone",
        },
        friendId
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    await invalidateUsersCache([userId, friendId], FRIEND_CACHE_SCOPES);

    return NextResponse.json(
      {
        message: "Friend request sent successfully",
        friendship: {
          id: friendshipId,
          friend: {
            id: friendId,
            name: friendUser.name || "Unknown",
            email: friendUser.email || "",
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


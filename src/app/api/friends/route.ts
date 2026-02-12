import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { supabaseReadRepository } from "@/lib/data/supabase-adapter";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";
import { notifyFriendRequest } from "@/lib/notificationService";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const cacheKey = buildUserScopedCacheKey(
      "friends",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.friends,
      async () =>
        supabaseReadRepository.getFriends({
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
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { email, userId: friendUserId, dummyName } = body || {};
    const supabase = requireSupabaseAdmin();

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

      const { data: dummyUser, error: dummyError } = await supabase
        .from("users")
        .insert({
          id: dummyId,
          name: trimmedName,
          email: dummyEmail.toLowerCase(),
          password: "dummy_no_login",
          is_dummy: true,
          created_by: userId,
          is_active: true,
          role: "user",
          auth_provider: "email",
          email_verified: false,
        })
        .select("id,name,email,is_dummy")
        .single();

      if (dummyError || !dummyUser) {
        throw dummyError || new Error("Failed to create dummy friend");
      }

      const forwardId = newAppId();
      const reverseId = newAppId();
      const { error: friendshipError } = await supabase.from("friendships").insert([
        {
          id: forwardId,
          user_id: userId,
          friend_id: dummyId,
          status: "accepted",
          requested_by: userId,
          created_at: nowIso,
          updated_at: nowIso,
        },
        {
          id: reverseId,
          user_id: dummyId,
          friend_id: userId,
          status: "accepted",
          requested_by: userId,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);

      if (friendshipError) {
        throw friendshipError;
      }

      await invalidateUsersCache(
        [userId, dummyId],
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
              id: dummyUser.id,
              name: dummyUser.name,
              email: dummyUser.email,
              isDummy: true,
            },
          },
        },
        { status: 201 }
      );
    }

    let friendUser: any = null;
    if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      const { data } = await supabase
        .from("users")
        .select("id,name,email,is_dummy")
        .eq("email", normalizedEmail)
        .eq("is_dummy", false)
        .maybeSingle();
      friendUser = data;
    } else if (friendUserId) {
      const { data } = await supabase
        .from("users")
        .select("id,name,email,is_dummy")
        .eq("id", String(friendUserId))
        .maybeSingle();
      friendUser = data;
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

    const { data: existingFriendship } = await supabase
      .from("friendships")
      .select("id,status")
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${friendUser.id}),and(user_id.eq.${friendUser.id},friend_id.eq.${userId})`
      )
      .limit(1);

    if (existingFriendship && existingFriendship.length > 0) {
      const status = existingFriendship[0].status;
      if (status === "accepted") {
        return NextResponse.json({ error: "Already friends" }, { status: 400 });
      }
      if (status === "pending") {
        return NextResponse.json(
          { error: "Friend request already sent" },
          { status: 400 }
        );
      }
    }

    const forwardId = newAppId();
    const reverseId = newAppId();
    const nowIso = new Date().toISOString();
    const { error: createFriendshipError } = await supabase.from("friendships").insert([
      {
        id: forwardId,
        user_id: userId,
        friend_id: friendUser.id,
        status: "pending",
        requested_by: userId,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: reverseId,
        user_id: friendUser.id,
        friend_id: userId,
        status: "pending",
        requested_by: userId,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]);
    if (createFriendshipError) {
      throw createFriendshipError;
    }

    try {
      const { data: currentUser } = await supabase
        .from("users")
        .select("id,name")
        .eq("id", userId)
        .maybeSingle();
      await notifyFriendRequest(
        {
          id: userId,
          name: currentUser?.name || "Someone",
        },
        String(friendUser.id)
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    await invalidateUsersCache(
      [userId, String(friendUser.id)],
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
          id: forwardId,
          friend: {
            id: friendUser.id,
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


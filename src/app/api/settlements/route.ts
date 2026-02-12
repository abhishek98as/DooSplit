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
import { notifySettlement } from "@/lib/notificationService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const groupId = searchParams.get("groupId");
    const friendId = searchParams.get("friendId");

    const cacheKey = buildUserScopedCacheKey(
      "settlements",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.settlements,
      async () =>
        supabaseReadRepository.getSettlements({
          userId,
          page,
          limit,
          groupId,
          friendId,
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
    console.error("Get settlements error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlements" },
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
    const currentUserId = auth.user.id;

    const body = await request.json();
    const fromUserId = String(body?.fromUserId || "");
    const toUserId = String(body?.toUserId || "");
    const amount = Number(body?.amount || 0);
    const currency = String(body?.currency || "INR");
    const method = String(body?.method || "Cash");
    const note = body?.note ? String(body.note) : "";
    const screenshot = body?.screenshot ? String(body.screenshot) : null;
    const groupId = body?.groupId ? String(body.groupId) : null;
    const settlementDate = body?.date ? new Date(body.date) : new Date();

    if (!fromUserId || !toUserId || !Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }
    if (fromUserId === toUserId) {
      return NextResponse.json(
        { error: "Cannot settle with yourself" },
        { status: 400 }
      );
    }
    if (fromUserId !== currentUserId && toUserId !== currentUserId) {
      return NextResponse.json(
        { error: "You must be part of the settlement" },
        { status: 403 }
      );
    }

    const supabase = requireSupabaseAdmin();

    const { data: userRows, error: userFetchError } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", [fromUserId, toUserId]);
    if (userFetchError) {
      throw userFetchError;
    }

    const usersMap = new Map((userRows || []).map((row: any) => [String(row.id), row]));
    if (!usersMap.get(fromUserId) || !usersMap.get(toUserId)) {
      return NextResponse.json(
        { error: "Invalid settlement users" },
        { status: 400 }
      );
    }

    let groupPayload: { _id: string; name: string; image: string | null } | null = null;
    if (groupId) {
      const { data: groupRow, error: groupError } = await supabase
        .from("groups")
        .select("id,name,image")
        .eq("id", groupId)
        .eq("is_active", true)
        .maybeSingle();
      if (groupError) {
        throw groupError;
      }
      if (groupRow) {
        groupPayload = {
          _id: groupRow.id,
          name: groupRow.name,
          image: groupRow.image || null,
        };
      }
    }

    const nowIso = new Date().toISOString();
    const settlementId = newAppId();
    const { data: row, error: insertError } = await supabase
      .from("settlements")
      .insert({
        id: settlementId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
        currency,
        method,
        note,
        screenshot,
        date: settlementDate.toISOString(),
        group_id: groupId,
        version: 1,
        last_modified: nowIso,
        modified_by: currentUserId,
      })
      .select("*")
      .single();

    if (insertError || !row) {
      throw insertError || new Error("Failed to record settlement");
    }

    const fromUser = usersMap.get(fromUserId);
    const toUser = usersMap.get(toUserId);

    try {
      await notifySettlement(
        row.id,
        { id: fromUserId, name: fromUser?.name || "Someone" },
        { id: toUserId, name: toUser?.name || "Someone" },
        Number(row.amount),
        row.currency || currency,
        currentUserId
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    const versionVector = {
      version: row.version || 1,
      lastModified: row.last_modified || row.updated_at,
      modifiedBy: row.modified_by || currentUserId,
    };

    await invalidateUsersCache(
      [fromUserId, toUserId],
      [
        "friends",
        "expenses",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
        "user-balance",
        "settlements",
        "analytics",
      ]
    );

    return NextResponse.json(
      {
        message: "Settlement recorded successfully",
        settlement: {
          _id: row.id,
          fromUserId: fromUser
            ? {
                _id: fromUser.id,
                name: fromUser.name,
                email: fromUser.email,
                profilePicture: fromUser.profile_picture || null,
              }
            : null,
          toUserId: toUser
            ? {
                _id: toUser.id,
                name: toUser.name,
                email: toUser.email,
                profilePicture: toUser.profile_picture || null,
              }
            : null,
          amount: Number(row.amount),
          currency: row.currency,
          method: row.method,
          note: row.note,
          screenshot: row.screenshot,
          date: row.date,
          groupId: groupPayload,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          _version: versionVector,
        },
      },
      {
        status: 201,
        headers: {
          ETag: `"${row.id}-${versionVector.version}"`,
          "X-Version-Vector": JSON.stringify(versionVector),
        },
      }
    );
  } catch (error: any) {
    console.error("Create settlement error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create settlement" },
      { status: 500 }
    );
  }
}


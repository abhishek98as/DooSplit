import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { getServerFirebaseUser } from "@/lib/auth/firebase-session";
import { createSettlementInFirestore } from "@/lib/firestore/write-operations";
import { notifySettlement } from "@/lib/notificationService";
import { getAdminDb } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const user = await getServerFirebaseUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

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
        firestoreReadRepository.getSettlements({
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
    const userId = auth.user.id;

    const body = await request.json();
    const { fromUserId, toUserId, amount, currency, method, note, screenshot, date, groupId } = body;

    if (!fromUserId || !toUserId || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (fromUserId === toUserId) {
      return NextResponse.json(
        { error: "Cannot settle with yourself" },
        { status: 400 }
      );
    }

    // Check if current user is part of the settlement
    if (userId !== fromUserId && userId !== toUserId) {
      return NextResponse.json(
        { error: "You must be part of the settlement" },
        { status: 403 }
      );
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    const settlementData = {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: numericAmount,
      currency: currency || "INR",
      method: method || "upi",
      note: note,
      screenshot: screenshot,
      date: date,
      group_id: groupId || null,
      version: 1,
      last_modified: new Date().toISOString(),
      modified_by: userId,
    };

    const settlementId = await createSettlementInFirestore(settlementData);
    const affectedUserIds = Array.from(
      new Set([String(fromUserId), String(toUserId), String(userId)].filter(Boolean))
    );

    try {
      const db = getAdminDb();
      const [fromUserDoc, toUserDoc] = await Promise.all([
        db.collection("users").doc(String(fromUserId)).get(),
        db.collection("users").doc(String(toUserId)).get(),
      ]);

      const fromUserName =
        String(fromUserDoc.data()?.name || "").trim() || "Someone";
      const toUserName = String(toUserDoc.data()?.name || "").trim() || "Someone";

      await notifySettlement(
        settlementId,
        { id: String(fromUserId), name: fromUserName },
        { id: String(toUserId), name: toUserName },
        numericAmount,
        settlementData.currency,
        userId
      );
    } catch (notificationError) {
      console.error("Failed to send settlement notification:", notificationError);
    }

    await invalidateUsersCache(affectedUserIds, [
      "settlements",
      "expenses",
      "friends",
      "groups",
      "activities",
      "dashboard-activity",
      "friend-transactions",
      "friend-details",
      "user-balance",
      "analytics",
    ]);

    // Return success response
    return NextResponse.json({
      success: true,
      settlementId,
      message: "Settlement created successfully",
    });
  } catch (error: any) {
    console.error("Create settlement error:", error);
    return NextResponse.json(
      { error: "Failed to create settlement" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Settlement from "@/models/Settlement";
import { authOptions } from "@/lib/auth";
import { notifySettlement } from "@/lib/notificationService";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache
} from "@/lib/cache";
import {
  mirrorUpsertToSupabase,
  readWithMode,
} from "@/lib/data";
import { mongoReadRepository, supabaseReadRepository } from "@/lib/data/read-routing";

export const dynamic = 'force-dynamic';

// GET /api/settlements - List settlements
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const groupId = searchParams.get("groupId");
    const friendId = searchParams.get("friendId");

    const cacheKey = buildUserScopedCacheKey(
      "settlements",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.settlements,
      async () =>
        readWithMode({
          routeName: "/api/settlements",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getSettlements({
              userId: session.user.id,
              page,
              limit,
              groupId,
              friendId,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getSettlements({
              userId: session.user.id,
              page,
              limit,
              groupId,
              friendId,
            }),
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

// POST /api/settlements - Create settlement
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      fromUserId,
      toUserId,
      amount,
      currency,
      method,
      note,
      screenshot,
      date,
      groupId,
    } = body;

    // Validation
    if (!fromUserId || !toUserId || !amount) {
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

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // User must be either sender or receiver
    if (
      fromUserId !== userId.toString() &&
      toUserId !== userId.toString()
    ) {
      return NextResponse.json(
        { error: "You must be part of the settlement" },
        { status: 403 }
      );
    }

    // Create settlement with version tracking
    const settlement = await Settlement.create({
      fromUserId: new mongoose.Types.ObjectId(fromUserId),
      toUserId: new mongoose.Types.ObjectId(toUserId),
      amount,
      currency: currency || "INR",
      method: method || "Cash",
      note: note || "",
      screenshot: screenshot || null,
      date: date || new Date(),
      groupId: groupId ? new mongoose.Types.ObjectId(groupId) : undefined,
      version: 1,
      lastModified: new Date(),
      modifiedBy: new mongoose.Types.ObjectId(session.user.id),
    });

    const populatedSettlement = await Settlement.findById(settlement._id)
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .populate("groupId", "name image");

    await mirrorUpsertToSupabase("settlements", settlement._id.toString(), {
      id: settlement._id.toString(),
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: Number(amount),
      currency: currency || "INR",
      method: String(method || "upi").toLowerCase(),
      note: note || null,
      screenshot: screenshot || null,
      date: date || new Date(),
      group_id: groupId || null,
      version: settlement.version || 1,
      last_modified: settlement.lastModified || new Date(),
      modified_by: session.user.id,
      created_at: settlement.createdAt,
      updated_at: settlement.updatedAt,
    });

    // Send notification to the other party
    try {
      await notifySettlement(
        settlement._id,
        {
          id: populatedSettlement!.fromUserId._id,
          name: (populatedSettlement!.fromUserId as any).name,
        },
        {
          id: populatedSettlement!.toUserId._id,
          name: (populatedSettlement!.toUserId as any).name,
        },
        amount,
        currency || "INR",
        userId
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    // Create version vector and ETag
    const versionVector = {
      version: settlement.version,
      lastModified: settlement.lastModified,
      modifiedBy: settlement.modifiedBy,
    };
    const etag = `"${settlement._id}-${settlement.version}"`;

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
          ...populatedSettlement!.toJSON(),
          _version: versionVector,
        },
      },
      {
        status: 201,
        headers: {
          'ETag': etag,
          'X-Version-Vector': JSON.stringify(versionVector),
        }
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


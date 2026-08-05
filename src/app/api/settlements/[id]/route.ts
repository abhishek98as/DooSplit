import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { toIso, toNum } from "@/lib/firestore/route-helpers";
import { SETTLEMENT_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { getSettlementById } from "@/lib/dynamodb/entities/settlements";
import { getUserById } from "@/lib/dynamodb/entities/users";
import { getGroupById } from "@/lib/dynamodb/entities/groups";
import { deleteSettlementInDynamo } from "@/lib/dynamodb/write-operations";
import type { DdbSettlement } from "@/lib/dynamodb/types";

export const dynamic = "force-dynamic";

type SettlementDetails = DdbSettlement & {
  method?: string;
  note?: string;
  screenshot?: string | null;
  version?: number;
  modified_by?: string;
};

async function loadSettlementPayload(settlementId: string, userId: string) {
  const row = (await getSettlementById(settlementId)) as SettlementDetails | null;
  if (!row || row.is_deleted) {
    throw new Error("Settlement not found");
  }

  const fromUserId = String(row.from_user_id || "");
  const toUserId = String(row.to_user_id || "");
  if (fromUserId !== userId && toUserId !== userId) {
    throw new Error("Forbidden");
  }

  const [fromUser, toUser, group] = await Promise.all([
    getUserById(fromUserId),
    getUserById(toUserId),
    row.group_id ? getGroupById(row.group_id) : Promise.resolve(null),
  ]);

  return {
    settlement: {
      _id: row.id,
      fromUserId: fromUser ? {
        _id: fromUser.id,
        name: fromUser.name,
        email: fromUser.email,
        profilePicture: fromUser.photo_url || null,
      } : null,
      toUserId: toUser ? {
        _id: toUser.id,
        name: toUser.name,
        email: toUser.email,
        profilePicture: toUser.photo_url || null,
      } : null,
      amount: toNum(row.amount),
      currency: String(row.currency || "INR"),
      method: String(row.method || "Cash"),
      note: String(row.notes || row.note || ""),
      screenshot: row.screenshot || null,
      date: toIso(row.date || row.created_at),
      groupId: group ? {
        _id: group.id,
        name: group.name,
        currency: group.currency,
      } : null,
      version: toNum(row.version || 1),
      lastModified: toIso(row.updated_at),
      modifiedBy: String(row.modified_by || ""),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const cacheKey = buildUserScopedCacheKey("settlement", userId, id);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.settlement, async () =>
      loadSettlementPayload(id, userId)
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    if (error.message === "Settlement not found") {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("Get settlement error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlement" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const existing = await getSettlementById(id);
    if (!existing || existing.is_deleted) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

    if (String(existing.from_user_id || "") !== userId) {
      return NextResponse.json(
        { error: "Only settlement sender can delete" },
        { status: 403 }
      );
    }

    await deleteSettlementInDynamo(id, existing.date, existing.from_user_id, existing.to_user_id);

    await invalidateUsersCache(
      [String(existing.from_user_id || ""), String(existing.to_user_id || "")],
      [...SETTLEMENT_MUTATION_CACHE_SCOPES]
    );

    return NextResponse.json(
      { message: "Settlement deleted successfully" },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Delete settlement error:", error);
    return NextResponse.json(
      { error: "Failed to delete settlement" },
      { status: 500 }
    );
  }
}

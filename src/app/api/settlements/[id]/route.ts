import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { mapGroup, mapUser, toIso, toNum } from "@/lib/firestore/route-helpers";
import { SETTLEMENT_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";

export const dynamic = "force-dynamic";

async function loadSettlementPayload(settlementId: string, userId: string) {
  const db = getAdminDb();
  const settlementDoc = await db.collection("settlements").doc(settlementId).get();
  if (!settlementDoc.exists) {
    throw new Error("Settlement not found");
  }

  const row: any = { id: settlementDoc.id, ...((settlementDoc.data() as any) || {}) };
  const fromUserId = String(row.from_user_id || "");
  const toUserId = String(row.to_user_id || "");
  if (fromUserId !== userId && toUserId !== userId) {
    throw new Error("Forbidden");
  }

  const [fromUserDoc, toUserDoc, groupDoc] = await Promise.all([
    db.collection("users").doc(fromUserId).get(),
    db.collection("users").doc(toUserId).get(),
    row.group_id ? db.collection("groups").doc(String(row.group_id)).get() : Promise.resolve(null),
  ]);

  const fromUser = fromUserDoc.exists
    ? mapUser({ id: fromUserDoc.id, ...((fromUserDoc.data() as any) || {}) })
    : null;
  const toUser = toUserDoc.exists
    ? mapUser({ id: toUserDoc.id, ...((toUserDoc.data() as any) || {}) })
    : null;
  const group = groupDoc && groupDoc.exists
    ? mapGroup({ id: groupDoc.id, ...((groupDoc.data() as any) || {}) })
    : null;

  return {
    settlement: {
      _id: String(row.id || ""),
      fromUserId: fromUser,
      toUserId: toUser,
      amount: toNum(row.amount),
      currency: String(row.currency || "INR"),
      method: String(row.method || "Cash"),
      note: String(row.note || row.notes || ""),
      screenshot: row.screenshot || null,
      date: toIso(row.date || row.created_at || row._created_at),
      groupId: group,
      version: toNum(row.version || 1),
      lastModified: toIso(row.last_modified || row.updated_at || row._updated_at),
      modifiedBy: String(row.modified_by || ""),
      createdAt: toIso(row.created_at || row._created_at),
      updatedAt: toIso(row.updated_at || row._updated_at),
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
    const db = getAdminDb();

    const ref = db.collection("settlements").doc(id);
    const existingDoc = await ref.get();
    if (!existingDoc.exists) {
      return NextResponse.json(
        { error: "Settlement not found" },
        { status: 404 }
      );
    }
    const existing: any = { id: existingDoc.id, ...((existingDoc.data() as any) || {}) };

    if (String(existing.from_user_id || "") !== userId) {
      return NextResponse.json(
        { error: "Only settlement sender can delete" },
        { status: 403 }
      );
    }

    await ref.delete();

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

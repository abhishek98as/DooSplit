import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { getServerFirebaseUser } from "@/lib/auth/firebase-session";

export const dynamic = "force-dynamic";

// GET /api/activities - Get activity feed
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

    const cacheKey = buildUserScopedCacheKey(
      "activities",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.activities,
      async () =>
        firestoreReadRepository.getActivities({
          userId,
          page,
          limit,
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
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}


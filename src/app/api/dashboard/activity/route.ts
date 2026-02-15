import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { getServerFirebaseUser } from "@/lib/auth/firebase-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const user = await getServerFirebaseUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const cacheKey = buildUserScopedCacheKey(
      "dashboard-activity",
      userId,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.dashboardActivity,
      async () =>
        firestoreReadRepository.getDashboardActivity({
          userId,
        })
    );

    return NextResponse.json(payload, {
      headers: {
        "X-Doosplit-Cache": cacheStatus,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Dashboard activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard activities" },
      { status: 500 }
    );
  }
}


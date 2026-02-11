import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";
import { readWithMode } from "@/lib/data";
import { mongoReadRepository, supabaseReadRepository } from "@/lib/data/read-routing";

export const dynamic = "force-dynamic";

// GET /api/activities - Get activity feed
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    const cacheKey = buildUserScopedCacheKey(
      "activities",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.activities,
      async () =>
        readWithMode({
          routeName: "/api/activities",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getActivities({
              userId: session.user.id,
              page,
              limit,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getActivities({
              userId: session.user.id,
              page,
              limit,
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
    console.error("Get activities error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

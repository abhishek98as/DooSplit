import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";
import { readWithMode } from "@/lib/data";
import { mongoReadRepository, supabaseReadRepository } from "@/lib/data/read-routing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = buildUserScopedCacheKey(
      "dashboard-activity",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.dashboardActivity,
      async () =>
        readWithMode({
          routeName: "/api/dashboard/activity",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getDashboardActivity({
              userId: session.user.id,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getDashboardActivity({
              userId: session.user.id,
            }),
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

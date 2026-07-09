import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getSmartNudges } from "@/lib/nudges/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const cacheKey = buildUserScopedCacheKey("nudges", userId, "v2");
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.analytics, async () => {
      try {
        return await getSmartNudges(userId);
      } catch (err) {
        console.error("getSmartNudges internal error:", err);
        return { nudges: [], generatedAt: new Date().toISOString() };
      }
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Get nudges error:", error);
    return NextResponse.json({ nudges: [], generatedAt: new Date().toISOString() }, { status: 200 });
  }
}

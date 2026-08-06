import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAiWeeklyUsage } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

/** Current week's AI token usage for the signed-in user. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const usage = await getAiWeeklyUsage(auth.user.id, auth.user.email);
    return NextResponse.json({ usage });
  } catch (error) {
    console.error("[ai/usage] GET error:", error);
    return NextResponse.json({ error: "Failed to load AI usage" }, { status: 500 });
  }
}

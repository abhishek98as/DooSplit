import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  AI_NOT_CONFIGURED,
  deepSeekComplete,
  getDeepSeekApiKey,
  stripJsonFence,
  toSafeAiError,
} from "@/lib/ai/deepseek";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    if (!getDeepSeekApiKey()) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    }

    const { description } = await request.json();
    if (!description || !String(description).trim()) {
      return NextResponse.json(
        { error: "Missing required field: 'description'." },
        { status: 400 }
      );
    }

    const responseText = await deepSeekComplete({
      system:
        "Predict expense categories. Reply with ONLY one lowercase category from: food, entertainment, travel, utilities, shopping, services, housing, other",
      user: `Description: ${String(description).slice(0, 500)}`,
      maxTokens: 32,
    });

    const allowed = new Set([
      "food",
      "entertainment",
      "travel",
      "utilities",
      "shopping",
      "services",
      "housing",
      "other",
    ]);
    const category = stripJsonFence(responseText).toLowerCase().replace(/[^a-z]/g, "");
    return NextResponse.json({
      category: allowed.has(category) ? category : "other",
    });
  } catch (error: any) {
    console.error("[ai/suggest] Error:", error);
    return NextResponse.json({ error: toSafeAiError(error) }, { status: 500 });
  }
}

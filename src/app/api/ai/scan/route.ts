import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  AI_NOT_CONFIGURED,
  deepSeekComplete,
  getDeepSeekApiKey,
  stripJsonFence,
  toSafeAiError,
} from "@/lib/ai/deepseek";
import {
  assertAiWeeklyAllowance,
  recordAiTokenUsage,
  weeklyLimitResponse,
} from "@/lib/ai/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Receipt scan: DeepSeek V4 Flash is text-first. Clients may still send images;
 * we accept optional OCR text, or return a clear manual-entry message.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    if (!getDeepSeekApiKey()) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    }

    const usage = await assertAiWeeklyAllowance(auth.user.id);
    if (usage.exhausted) {
      return NextResponse.json(weeklyLimitResponse(usage), { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { image, mimeType, ocrText } = body;

    const textHint = typeof ocrText === "string" ? ocrText.trim().slice(0, 8000) : "";

    if (!textHint && image && mimeType) {
      return NextResponse.json(
        {
          error:
            "Receipt image scanning requires OCR text. Enter the bill details manually, or paste receipt text.",
          code: "VISION_UNSUPPORTED",
        },
        { status: 422 }
      );
    }

    if (!textHint) {
      return NextResponse.json(
        { error: "Provide receipt text (ocrText) to extract expense fields." },
        { status: 400 }
      );
    }

    const { text: responseText, totalTokens } = await deepSeekComplete({
      system: `You are an expert receipt parser. Extract expense fields from receipt text.
Return ONLY valid JSON:
{
  "title": "Merchant/Store name or description",
  "amount": number,
  "category": "food|entertainment|travel|utilities|shopping|services|housing|other",
  "date": "YYYY-MM-DD",
  "items": [{ "name": "string", "amount": number }]
}`,
      user: textHint,
      jsonMode: true,
      maxTokens: 2048,
    });
    await recordAiTokenUsage(auth.user.id, totalTokens);

    const parsedData = JSON.parse(stripJsonFence(responseText));
    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("[ai/scan] Error:", error);
    return NextResponse.json({ error: toSafeAiError(error) }, { status: 500 });
  }
}

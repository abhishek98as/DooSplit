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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    if (!getDeepSeekApiKey()) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    }

    const usage = await assertAiWeeklyAllowance(auth.user.id, auth.user.email);
    if (usage.exhausted) {
      return NextResponse.json(weeklyLimitResponse(usage), { status: 429 });
    }

    const { note, action, customPrompt } = await request.json();
    if (!note || !action) {
      return NextResponse.json(
        { error: "Missing required fields: 'note' and 'action'." },
        { status: 400 }
      );
    }

    let systemInstructions = "";
    if (action === "summarize") {
      systemInstructions =
        "Summarize this note content. Keep it concise, professional, and clear.";
    } else if (action === "checklist") {
      systemInstructions =
        "Convert this note content into a clean checklist/to-do list of actionable items.";
    } else if (action === "grammar") {
      systemInstructions =
        "Fix any spelling, punctuation, and grammatical mistakes in the note content. Keep the layout clean and polished.";
    } else if (action === "custom") {
      const safePrompt = String(customPrompt || "Improve the writing").slice(0, 500);
      systemInstructions = `Modify the note content according to these instructions: "${safePrompt}"`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const userPrompt = `
Current Note Title: ${JSON.stringify(note.title || "")}
Current Note Type: ${JSON.stringify(note.type || "text")}
Current Note Text: ${JSON.stringify(note.text || "")}
Current Note Checklist Items: ${JSON.stringify(note.items || [])}

Return ONLY valid JSON matching:
{
  "title": "string",
  "type": "text" | "list",
  "text": "string",
  "items": [{ "id": "string", "text": "string", "done": false }]
}
`;

    const { text: responseText, totalTokens } = await deepSeekComplete({
      system: `You are an expert AI assistant inside a notes app. ${systemInstructions}`,
      user: userPrompt,
      jsonMode: true,
      maxTokens: 4096,
    });
    await recordAiTokenUsage(auth.user.id, totalTokens, auth.user.email);

    const parsedData = JSON.parse(stripJsonFence(responseText));
    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("[ai/notes] Error:", error);
    return NextResponse.json({ error: toSafeAiError(error) }, { status: 500 });
  }
}

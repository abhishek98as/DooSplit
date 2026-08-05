import "server-only";
import OpenAI from "openai";

export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/** Generic client-facing error — never include env names or provider payloads. */
export const AI_UNAVAILABLE = "AI is temporarily unavailable";
export const AI_NOT_CONFIGURED = "AI is not configured";

export function getDeepSeekApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  return key || null;
}

export function requireDeepSeekApiKey(): string {
  const key = getDeepSeekApiKey();
  if (!key) {
    throw new Error(AI_NOT_CONFIGURED);
  }
  return key;
}

export function createDeepSeekClient(): OpenAI {
  return new OpenAI({
    apiKey: requireDeepSeekApiKey(),
    baseURL: DEEPSEEK_BASE_URL,
  });
}

/** Standard thinking-high request extras for DeepSeek V4. */
export function deepSeekChatExtras(): Record<string, unknown> {
  return {
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  };
}

/**
 * Non-streaming text completion (notes / suggest / simple tasks).
 * Never returns raw provider errors to callers — throws AI_UNAVAILABLE.
 */
export async function deepSeekComplete(params: {
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  try {
    const client = createDeepSeekClient();
    const res = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_tokens: params.maxTokens ?? 4096,
      reasoning_effort: "high",
      // DeepSeek thinking mode
      ...( { thinking: { type: "enabled" } } as Record<string, unknown> ),
      ...(params.jsonMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    if (err?.message === AI_NOT_CONFIGURED) throw err;
    console.error("[deepseek] complete failed:", err?.message || err);
    throw new Error(AI_UNAVAILABLE);
  }
}

/** Strip provider/env secrets from any error before sending to the client. */
export function toSafeAiError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (msg === AI_NOT_CONFIGURED || msg === AI_UNAVAILABLE) return msg;
  if (/api[_ ]?key|deepseek|gemini|sk-/i.test(msg)) return AI_UNAVAILABLE;
  return AI_UNAVAILABLE;
}

export function stripJsonFence(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

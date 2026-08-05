import "server-only";

/** Simple per-user in-memory rate limit for AI chat (resets on cold start). */
const buckets = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

export function checkAiChatRateLimit(userId: string): {
  ok: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const entry = buckets.get(userId);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfterSec };
  }
  entry.count += 1;
  return { ok: true };
}

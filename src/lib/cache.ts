import { createHash } from "crypto";

/**
 * Lightweight in-process cache for DooSplit.
 *
 * Redis has been intentionally removed for this deployment scale (5-10 users).
 * Reasons:
 *  - Direct Firestore reads are 10-50ms; Redis added 50-120ms of network overhead.
 *  - Free-tier Redis (100 ops/sec) was a bottleneck, not a benefit.
 *  - Serverless instances don't share memory anyway, so Redis was the only
 *    cross-instance cache — but with only 5-10 users it's not needed.
 *
 * What we keep:
 *  - A short-lived in-process memory cache (5s) to deduplicate rapid burst
 *    requests within the same serverless invocation (e.g. dashboard parallel fetches).
 *  - On mutation (invalidateUsersCache), affected keys are cleared immediately.
 */

const CACHE_PREFIX = process.env.CACHE_PREFIX || "doosplit:v1";

// 5 seconds: deduplicates burst requests in the same invocation,
// but data is never more than 5s stale even if invalidation is skipped.
const MEMORY_CACHE_MAX_TTL_SECONDS = 5;

export const CACHE_TTL = {
  expenses: 5,            // 5 seconds — always fetch fresh from Firestore
  friends: 5,             // 5 seconds
  groups: 5,              // 5 seconds
  activities: 5,          // 5 seconds
  dashboardActivity: 5,   // 5 seconds
  settlements: 5,         // 5 seconds
  settlement: 5,          // 5 seconds
  analytics: 30,          // 30 seconds — less critical
  userBalance: 5,         // 5 seconds
};

export type CacheStatus = "HIT" | "MISS";

export interface CacheResult<T> {
  data: T;
  cacheStatus: CacheStatus;
}

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __doosplitMemoryCache: Map<string, MemoryCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __doosplitMemoryRegistry: Map<string, Set<string>> | undefined;
}

const memoryCache: Map<string, MemoryCacheEntry> =
  global.__doosplitMemoryCache || new Map<string, MemoryCacheEntry>();
const memoryRegistry: Map<string, Set<string>> =
  global.__doosplitMemoryRegistry || new Map<string, Set<string>>();

if (!global.__doosplitMemoryCache) {
  global.__doosplitMemoryCache = memoryCache;
}
if (!global.__doosplitMemoryRegistry) {
  global.__doosplitMemoryRegistry = memoryRegistry;
}

/**
 * Build a deterministic, user-scoped cache key.
 * Format: PREFIX:scope:user:userId:sha1(input)
 */
export function buildUserScopedCacheKey(
  scope: string,
  userId: string,
  input = ""
): string {
  const digest = createHash("sha1").update(input).digest("hex");
  return `${CACHE_PREFIX}:${scope}:user:${userId}:${digest}`;
}

function registryKey(scope: string, userId: string): string {
  return `${CACHE_PREFIX}:reg:${scope}:${userId}`;
}

function parseKeyParts(key: string): { scope: string; userId: string } | null {
  const prefixParts = CACHE_PREFIX.split(":");
  const parts = key.split(":");
  const scopeIndex = prefixParts.length;
  const scope = parts[scopeIndex];
  const userId = parts[scopeIndex + 2]; // skip "user" token
  if (scope && userId) {
    return { scope, userId };
  }
  return null;
}

function memoryGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

function memorySet(key: string, value: unknown, ttlSeconds: number): void {
  const cappedTtl = Math.min(ttlSeconds, MEMORY_CACHE_MAX_TTL_SECONDS);
  memoryCache.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + cappedTtl * 1000,
  });

  const parsed = parseKeyParts(key);
  if (!parsed) {
    return;
  }
  const regKey = registryKey(parsed.scope, parsed.userId);
  const tracked = memoryRegistry.get(regKey) || new Set<string>();
  tracked.add(key);
  memoryRegistry.set(regKey, tracked);
}

/**
 * Get cached JSON or load fresh data and cache it.
 */
export async function getOrSetCacheJson<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const result = await getOrSetCacheJsonWithMeta(key, ttlSeconds, loader);
  return result.data;
}

/**
 * Get cached JSON or load fresh data and cache it.
 * Returns cache metadata for diagnostics.
 */
export async function getOrSetCacheJsonWithMeta<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<CacheResult<T>> {
  // Check in-process memory cache first (deduplicates burst requests)
  const memoryCached = memoryGet<T>(key);
  if (memoryCached !== null) {
    return {
      data: memoryCached,
      cacheStatus: "HIT",
    };
  }

  // Always fetch fresh from Firestore
  const fresh = await loader();

  // Store briefly to deduplicate simultaneous requests
  memorySet(key, fresh, ttlSeconds);

  return {
    data: fresh,
    cacheStatus: "MISS",
  };
}

/**
 * Invalidate all in-process cache entries for the given users and scopes.
 * Instant — no network hop needed.
 */
export async function invalidateUsersCache(
  userIds: Array<string>,
  scopes: Array<string>
): Promise<void> {
  if (userIds.length === 0 || scopes.length === 0) {
    return;
  }

  const uniqueUsers = Array.from(
    new Set(userIds.map((id) => id.toString()).filter(Boolean))
  );

  for (const userId of uniqueUsers) {
    for (const scope of scopes) {
      const regKey = registryKey(scope, userId);
      const trackedMemoryKeys = memoryRegistry.get(regKey);
      if (trackedMemoryKeys) {
        for (const key of trackedMemoryKeys) {
          memoryCache.delete(key);
        }
        memoryRegistry.delete(regKey);
      }
    }
  }
}

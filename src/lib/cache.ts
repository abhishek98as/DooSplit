import { createHash } from "crypto";
import { getRedisClient } from "@/lib/redis";

const CACHE_PREFIX = process.env.CACHE_PREFIX || "doosplit:v1";

export const CACHE_TTL = {
  expenses: 180,
  friends: 180,
  groups: 180,
  activities: 120,
  dashboardActivity: 120,
  settlements: 180,
  settlement: 120,
  analytics: 180,
  userBalance: 120,
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

/**
 * Registry key that holds all cache keys for a given user + scope.
 * This avoids expensive SCAN operations on Redis free tier (100 ops/sec).
 */
function registryKey(scope: string, userId: string): string {
  return `${CACHE_PREFIX}:reg:${scope}:${userId}`;
}

/**
 * Extract scope and userId from a cache key.
 * Key format: PREFIX:scope:user:userId:digest
 */
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
  memoryCache.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
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
 * Fail-open: if Redis is down, falls back to the loader directly.
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
  const redis = await getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return {
          data: JSON.parse(cached) as T,
          cacheStatus: "HIT",
        };
      }
    } catch (error: any) {
      console.warn("Redis read failed, falling back to DB:", error.message);
    }
  }

  const memoryCached = memoryGet<T>(key);
  if (memoryCached !== null) {
    return {
      data: memoryCached,
      cacheStatus: "HIT",
    };
  }

  const fresh = await loader();

  if (redis) {
    try {
      // Store the value
      await redis.setEx(key, ttlSeconds, JSON.stringify(fresh));

      // Register this key for fast invalidation (avoids SCAN)
      const parsed = parseKeyParts(key);
      if (parsed) {
        const regKey = registryKey(parsed.scope, parsed.userId);
        await redis.sAdd(regKey, key);
        // Registry TTL slightly longer than max data TTL so it auto-cleans
        await redis.expire(regKey, 180);
      }
    } catch (error: any) {
      console.warn("Redis write failed, continuing without cache:", error.message);
    }
  }

  // Keep a process-local fallback cache for Redis-disabled environments.
  memorySet(key, fresh, ttlSeconds);

  return {
    data: fresh,
    cacheStatus: "MISS",
  };
}

/**
 * Invalidate all cache entries for the given users and scopes.
 *
 * Uses a registry-based approach instead of SCAN:
 * - Each cached key is tracked in a Redis Set (reg:scope:userId)
 * - On invalidation we read the set, then batch-delete everything
 * - Total Redis ops: 1 SMEMBERS + 1 DEL per user/scope pair
 *   (vs unlimited SCAN iterations before)
 *
 * This is critical for your Redis free tier (100 ops/sec limit).
 */
export async function invalidateUsersCache(
  userIds: Array<string>,
  scopes: Array<string>
): Promise<void> {
  if (userIds.length === 0 || scopes.length === 0) {
    return;
  }

  const redis = await getRedisClient();

  const uniqueUsers = Array.from(
    new Set(userIds.map((id) => id.toString()).filter(Boolean))
  );

  try {
    const keysToDelete: string[] = [];

    for (const userId of uniqueUsers) {
      for (const scope of scopes) {
        const regKey = registryKey(scope, userId);
        if (redis) {
          // Get all tracked keys for this user+scope (1 op)
          const trackedKeys = await redis.sMembers(regKey);

          if (trackedKeys.length > 0) {
            keysToDelete.push(...trackedKeys);
          }
          // Always delete the registry key itself
          keysToDelete.push(regKey);
        }

        // Clear process-local fallback keys.
        const trackedMemoryKeys = memoryRegistry.get(regKey);
        if (trackedMemoryKeys) {
          for (const key of trackedMemoryKeys) {
            memoryCache.delete(key);
          }
          memoryRegistry.delete(regKey);
        }
      }
    }

    if (redis && keysToDelete.length > 0) {
      // Delete all keys in one batch (single DEL call = 1 op)
      await redis.del(keysToDelete);
    }
  } catch (error: any) {
    console.warn("Redis invalidation failed:", error.message);
  }
}

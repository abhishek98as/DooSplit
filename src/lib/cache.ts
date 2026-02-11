import { createHash } from "crypto";
import { getRedisClient } from "@/lib/redis";

const CACHE_PREFIX = process.env.CACHE_PREFIX || "doosplit:v1";

export const CACHE_TTL = {
  expenses: 45,
  friends: 45,
  groups: 60,
  activities: 30,
  dashboardActivity: 30,
  settlements: 45,
  settlement: 30,
  analytics: 120,
  userBalance: 45,
};

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

/**
 * Get cached JSON or load fresh data and cache it.
 * Fail-open: if Redis is down, falls back to the loader directly.
 */
export async function getOrSetCacheJson<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error: any) {
      console.warn("Redis read failed, falling back to DB:", error.message);
    }
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

  return fresh;
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
  if (!redis) {
    return;
  }

  const uniqueUsers = Array.from(
    new Set(userIds.map((id) => id.toString()).filter(Boolean))
  );

  try {
    const keysToDelete: string[] = [];

    for (const userId of uniqueUsers) {
      for (const scope of scopes) {
        const regKey = registryKey(scope, userId);

        // Get all tracked keys for this user+scope (1 op)
        const trackedKeys = await redis.sMembers(regKey);

        if (trackedKeys.length > 0) {
          keysToDelete.push(...trackedKeys);
        }
        // Always delete the registry key itself
        keysToDelete.push(regKey);
      }
    }

    if (keysToDelete.length > 0) {
      // Delete all keys in one batch (single DEL call = 1 op)
      await redis.del(keysToDelete);
    }
  } catch (error: any) {
    console.warn("Redis invalidation failed:", error.message);
  }
}

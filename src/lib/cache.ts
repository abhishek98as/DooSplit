import { createHash } from "crypto";
import { Redis } from "@upstash/redis";

/**
 * Multi-layer caching system for DooSplit on Vercel/DynamoDB:
 *
 * Layer 1: Short-lived in-process memory cache (5s TTL)
 *   - Prevents duplicate reads during burst operations (e.g. parallel dashboard requests).
 * Layer 2: Globally shared Upstash Redis Cache (REST-based, serverless friendly)
 *   - Persists cache state across serverless instances to save DynamoDB read costs.
 * Layer 3: DynamoDB Database (Fresh read query)
 */

const CACHE_PREFIX = process.env.CACHE_PREFIX || "doosplit:v2";
const MEMORY_CACHE_MAX_TTL_SECONDS = 5;

// Cache TTLs in seconds for the shared cache
export const CACHE_TTL = {
  expenses: 30,            // 30 seconds
  friends: 30,             // 30 seconds
  groups: 30,              // 30 seconds
  activities: 30,          // 30 seconds
  dashboardActivity: 30,   // 30 seconds
  settlements: 30,         // 30 seconds
  settlement: 30,          // 30 seconds
  analytics: 300,          // 5 minutes
  userBalance: 30,         // 30 seconds
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

// Initialize Upstash Redis client with safety checks
const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/"/g, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.replace(/"/g, "");

const redisClient =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

/**
 * Build a deterministic, user-scoped cache key.
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
  // 1. Check in-process memory cache first (0ms overhead)
  const memoryCached = memoryGet<T>(key);
  if (memoryCached !== null) {
    return {
      data: memoryCached,
      cacheStatus: "HIT",
    };
  }

  // 2. Check Upstash Redis global cache (shared across instances)
  if (redisClient) {
    try {
      const redisCached = await redisClient.get(key);
      if (redisCached) {
        const parsed = typeof redisCached === "string" ? JSON.parse(redisCached) : redisCached;
        memorySet(key, parsed, ttlSeconds);
        return {
          data: parsed as T,
          cacheStatus: "HIT",
        };
      }
    } catch (redisErr: any) {
      console.warn("[cache] Upstash Redis get error:", redisErr?.message || redisErr);
    }
  }

  // 3. Fallback to database loader
  const fresh = await loader();

  // 4. Cache in memory (short TTL to deduplicate next requests)
  memorySet(key, fresh, ttlSeconds);

  // 5. Cache in Upstash Redis
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(fresh), { ex: ttlSeconds });

      // Register this key in the scope registry so we can invalidate it
      const parsed = parseKeyParts(key);
      if (parsed) {
        const regKey = registryKey(parsed.scope, parsed.userId);
        await redisClient.sadd(regKey, key);
        await redisClient.expire(regKey, ttlSeconds);
      }
    } catch (redisErr: any) {
      console.warn("[cache] Upstash Redis set error:", redisErr?.message || redisErr);
    }
  }

  return {
    data: fresh,
    cacheStatus: "MISS",
  };
}

/**
 * Invalidate all cache entries (local memory and Upstash Redis) for given users and scopes.
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

  // Clear in-process memory cache
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

  // Clear Upstash Redis global cache
  if (redisClient) {
    try {
      await Promise.all(
        uniqueUsers.flatMap((userId) =>
          scopes.map(async (scope) => {
            const regKey = registryKey(scope, userId);
            const keys = await redisClient!.smembers(regKey);
            if (keys && keys.length > 0) {
              const pipeline = redisClient!.pipeline();
              pipeline.del(...keys);
              pipeline.del(regKey);
              await pipeline.exec();
            }
          })
        )
      );
    } catch (redisErr: any) {
      console.warn("[cache] Upstash Redis invalidation error:", redisErr?.message || redisErr);
    }
  }
}

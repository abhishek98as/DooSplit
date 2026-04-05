/**
 * Redis has been removed from DooSplit.
 * This stub exists only to avoid breaking any imports during transition.
 * It always returns null, effectively disabling Redis everywhere.
 *
 * All caching is now handled by the lightweight in-process memory cache in cache.ts.
 */
export async function getRedisClient(): Promise<null> {
  return null;
}

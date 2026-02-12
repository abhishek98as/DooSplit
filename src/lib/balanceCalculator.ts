import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";

export interface Balance {
  userId: string;
  amount: number;
}

export interface UserBalance {
  withUser: {
    id: string;
    name: string;
    email: string;
    profilePicture?: string;
  };
  balance: number;
}

export async function calculateBalanceBetweenUsers(
  userId1: string,
  userId2: string,
  skipCache = false
): Promise<number> {
  const sortedIds = [String(userId1), String(userId2)].sort();
  const cacheKey = buildUserScopedCacheKey("user-balance", sortedIds[0], sortedIds[1]);

  if (skipCache) {
    return 0;
  }

  return getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => 0);
}

export async function getUserBalances(_userId: string): Promise<Map<string, number>> {
  return new Map<string, number>();
}

export async function getTotalBalance(
  _userId: string
): Promise<{ total: number; youOwe: number; youAreOwed: number }> {
  return {
    total: 0,
    youOwe: 0,
    youAreOwed: 0,
  };
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

export interface SimplifiedDebts {
  transactions: SimplifiedDebt[];
  originalCount: number;
  optimizedCount: number;
}

export async function simplifyGroupDebts(_userIds: string[]): Promise<SimplifiedDebts> {
  return {
    transactions: [],
    originalCount: 0,
    optimizedCount: 0,
  };
}

export async function getGroupSimplifiedDebts(_groupId: string) {
  return {
    transactions: [],
    originalCount: 0,
    optimizedCount: 0,
    savings: 0,
  };
}

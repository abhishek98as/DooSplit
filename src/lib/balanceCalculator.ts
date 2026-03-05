/**
 * @deprecated This file is a dead stub — all functions return 0/empty.
 * It is NOT imported anywhere in the codebase.
 * For real balance calculations use:
 *   - src/lib/data/balance-service.ts  (server-side, production calculations)
 *   - src/lib/balance-recalculator.ts  (client-side, offline IndexedDB calculations)
 *
 * TODO: Remove this file once confirmed no external consumers exist.
 */

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
  _userId1: string,
  _userId2: string,
  _skipCache = false
): Promise<number> {
  return 0;
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

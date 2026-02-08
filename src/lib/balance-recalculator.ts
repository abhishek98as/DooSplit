/**
 * Balance Recalculation Service
 *
 * Recalculates all balances after sync operations to ensure consistency
 */

import getIndexedDB, { ExpenseRecord, SettlementRecord, FriendRecord, GroupRecord } from './indexeddb';

export interface BalanceSummary {
  total: number; // Net balance (positive = owed money, negative = owe money)
  youOwe: number; // Total amount owed to others
  youAreOwed: number; // Total amount others owe you
}

export interface FriendBalance extends FriendRecord {
  recalculatedBalance: number;
}

export interface GroupBalance extends GroupRecord {
  recalculatedBalance: number;
}

/**
 * Recalculate all balances
 */
export async function recalculateBalances(): Promise<{
  friendBalances: FriendBalance[];
  groupBalances: GroupBalance[];
  summary: BalanceSummary;
}> {
  console.log('🔄 Recalculating balances...');

  const indexedDB = getIndexedDB();

  // Get current user ID (this should be passed or retrieved from session)
  // For now, we'll assume we need to get it from somewhere
  const currentUserId = await getCurrentUserId();

  if (!currentUserId) {
    throw new Error('No current user found');
  }

  // Recalculate friend balances
  const friends = await indexedDB.getFriends(currentUserId);
  const friendBalances = await Promise.all(
    friends.map(friend => recalculateFriendBalance(currentUserId, friend))
  );

  // Recalculate group balances
  const groups = await indexedDB.getGroups(currentUserId);
  const groupBalances = await Promise.all(
    groups.map(group => recalculateGroupBalance(currentUserId, group))
  );

  // Calculate summary
  const summary = calculateSummary(friendBalances);

  // Update balances in IndexedDB
  await Promise.all([
    ...friendBalances.map(friend =>
      indexedDB.putFriend({
        ...friend,
        balance: friend.recalculatedBalance
      })
    ),
    ...groupBalances.map(group =>
      indexedDB.putGroup({
        ...group,
        balance: group.recalculatedBalance
      })
    ),
  ]);

  console.log('✅ Balance recalculation completed');

  return {
    friendBalances,
    groupBalances,
    summary,
  };
}

/**
 * Recalculate balance for a specific friend
 */
export async function recalculateFriendBalance(
  userId: string,
  friend: FriendRecord
): Promise<FriendBalance> {
  const indexedDB = getIndexedDB();

  // Get all expenses involving both users
  const expenses = await indexedDB.getAll('expenses');
  const settlements = await indexedDB.getAll('settlements');

  // Find expenses where both users are participants
  const relevantExpenses = expenses.filter((expense: any) => {
    const participants = expense.participants || [];
    const hasUser = participants.some((p: any) => p.userId === userId);
    const hasFriend = participants.some((p: any) => p.userId === friend.friendId);
    return hasUser && hasFriend && !expense.isDeleted;
  });

  let balance = 0;

  // Calculate balance from expenses
  for (const expense of relevantExpenses) {
    const participants = (expense as any).participants || [];
    const userParticipant = participants.find((p: any) => p.userId === userId);
    const friendParticipant = participants.find((p: any) => p.userId === friend.friendId);

    if (userParticipant && friendParticipant) {
      // Calculate net position for each user
      const userNetPosition = userParticipant.paidAmount - userParticipant.owedAmount;
      const friendNetPosition = friendParticipant.paidAmount - friendParticipant.owedAmount;

      // Balance = what friend owes user
      // If friendNetPosition is negative (friend owes), balance becomes positive
      balance -= friendNetPosition;
    }
  }

  // Subtract settlements
  const relevantSettlements = settlements.filter((settlement: any) =>
    (settlement.fromUserId === userId && settlement.toUserId === friend.friendId) ||
    (settlement.fromUserId === friend.friendId && settlement.toUserId === userId)
  );

  for (const settlement of relevantSettlements) {
    const settlementData = settlement as any;
    if (settlementData.fromUserId === userId) {
      // User paid friend - reduce balance
      balance -= settlementData.amount;
    } else {
      // Friend paid user - increase balance
      balance += settlementData.amount;
    }
  }

  return {
    ...friend,
    recalculatedBalance: Math.round(balance * 100) / 100, // Round to 2 decimal places
  };
}

/**
 * Recalculate balance for a specific group
 */
export async function recalculateGroupBalance(
  userId: string,
  group: GroupRecord
): Promise<GroupBalance> {
  const indexedDB = getIndexedDB();

  // Get all expenses for this group
  const expenses = await indexedDB.getByIndex('expenses', 'groupId', group._id);

  let balance = 0;

  // Calculate user's net position in each expense
  for (const expense of expenses) {
    const userParticipant = (expense as any).participants?.find((p: any) => p.userId === userId);
    if (userParticipant) {
      const userNetPosition = userParticipant.paidAmount - userParticipant.owedAmount;
      balance += userNetPosition;
    }
  }

  return {
    ...group,
    recalculatedBalance: Math.round(balance * 100) / 100,
  };
}

/**
 * Calculate summary from friend balances
 */
function calculateSummary(friendBalances: FriendBalance[]): BalanceSummary {
  const youOwe = friendBalances
    .filter(f => f.recalculatedBalance < 0)
    .reduce((sum, f) => sum + Math.abs(f.recalculatedBalance), 0);

  const youAreOwed = friendBalances
    .filter(f => f.recalculatedBalance > 0)
    .reduce((sum, f) => sum + f.recalculatedBalance, 0);

  return {
    total: youAreOwed - youOwe,
    youOwe: Math.round(youOwe * 100) / 100,
    youAreOwed: Math.round(youAreOwed * 100) / 100,
  };
}

/**
 * Validate balance calculations
 */
export async function validateBalances(): Promise<{
  isValid: boolean;
  inconsistencies: string[];
}> {
  console.log('🔍 Validating balance calculations...');

  const indexedDB = getIndexedDB();
  const inconsistencies: string[] = [];

  try {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      return { isValid: false, inconsistencies: ['No current user found'] };
    }

    // Get all data
    const expenses = await indexedDB.getAll('expenses');
    const settlements = await indexedDB.getAll('settlements');
    const friends = await indexedDB.getFriends(currentUserId);

    // Validate that balances are consistent with expense/settlement data
    for (const friend of friends) {
      const recalculated = await recalculateFriendBalance(currentUserId, friend);
      const storedBalance = (friend as any).balance || 0;
      const difference = Math.abs(recalculated.recalculatedBalance - storedBalance);

      if (difference > 0.01) { // Allow small rounding differences
        inconsistencies.push(
          `Friend ${(friend as any).name}: stored balance ${storedBalance}, recalculated ${recalculated.recalculatedBalance}`
        );
      }
    }

    // Validate that total balances make sense
    const totalFromFriends = friends.reduce((sum, f) => sum + ((f as any).balance || 0), 0);

    // Calculate total from all expenses and settlements
    let totalFromTransactions = 0;

    for (const expense of expenses) {
      const expenseData = expense as any;
      if (expenseData.isDeleted) continue;

      const userParticipant = expenseData.participants?.find((p: any) => p.userId === currentUserId);
      if (userParticipant) {
        totalFromTransactions += userParticipant.paidAmount - userParticipant.owedAmount;
      }
    }

    for (const settlement of settlements) {
      const settlementData = settlement as any;
      if (settlementData.fromUserId === currentUserId) {
        totalFromTransactions -= settlementData.amount;
      } else if (settlementData.toUserId === currentUserId) {
        totalFromTransactions += settlementData.amount;
      }
    }

    const totalDifference = Math.abs(totalFromFriends - totalFromTransactions);
    if (totalDifference > 0.01) {
      inconsistencies.push(
        `Total balance inconsistency: friends total ${totalFromFriends}, transactions total ${totalFromTransactions}`
      );
    }

    return {
      isValid: inconsistencies.length === 0,
      inconsistencies,
    };

  } catch (error: any) {
    return {
      isValid: false,
      inconsistencies: [`Validation error: ${error.message}`],
    };
  }
}

/**
 * Force balance recalculation and sync
 */
export async function forceBalanceRecalculation(): Promise<void> {
  console.log('🔄 Forcing balance recalculation...');

  const result = await recalculateBalances();

  // Store the results in metadata
  const indexedDB = getIndexedDB();
  await indexedDB.putMetadata('lastBalanceRecalculation', {
    timestamp: new Date().toISOString(),
    summary: result.summary,
    friendCount: result.friendBalances.length,
    groupCount: result.groupBalances.length,
  });

  console.log('✅ Balance recalculation completed and stored');
}

/**
 * Get current user ID (placeholder - should be implemented based on auth system)
 */
async function getCurrentUserId(): Promise<string | null> {
  // This should be implemented to get the current user ID from your auth system
  // For now, return null - this needs to be integrated with your authentication
  console.warn('getCurrentUserId() not implemented - needs integration with auth system');
  return null;
}

/**
 * Set the current user ID for balance calculations
 */
export function setCurrentUserId(userId: string): void {
  // Store current user ID for balance calculations
  localStorage.setItem('currentUserId', userId);
}

/**
 * Get the current user ID for balance calculations
 */
export function getCurrentUserIdFromStorage(): string | null {
  return localStorage.getItem('currentUserId');
}
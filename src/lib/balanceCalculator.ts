import mongoose from "mongoose";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import {
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  CACHE_TTL,
} from "@/lib/cache";

export interface Balance {
  userId: string;
  amount: number; // Positive = they owe you, Negative = you owe them
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

/**
 * Calculate balance between two users with caching
 */
export async function calculateBalanceBetweenUsers(
  userId1: string | mongoose.Types.ObjectId,
  userId2: string | mongoose.Types.ObjectId,
  skipCache: boolean = false
): Promise<number> {
  const id1 = new mongoose.Types.ObjectId(userId1);
  const id2 = new mongoose.Types.ObjectId(userId2);

  // Create deterministic cache key (sorted IDs to ensure consistency)
  const sortedIds = [id1.toString(), id2.toString()].sort();
  const cacheKey = buildUserScopedCacheKey(
    "user-balance",
    sortedIds[0],
    sortedIds[1]
  );

  if (skipCache) {
    return await calculateBalanceBetweenUsersInternal(id1, id2);
  }

  return await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
    return await calculateBalanceBetweenUsersInternal(id1, id2);
  });
}

/**
 * Internal calculation without caching
 */
async function calculateBalanceBetweenUsersInternal(
  id1: mongoose.Types.ObjectId,
  id2: mongoose.Types.ObjectId
): Promise<number> {
  // Get all expense participants for both users in one query
  const participants = await ExpenseParticipant.find({
    userId: { $in: [id1, id2] },
    isSettled: false,
  })
    .select("expenseId userId paidAmount owedAmount")
    .lean();

  // Get distinct expense IDs and filter for non-deleted expenses
  const expenseIds = [...new Set(participants.map((p) => p.expenseId))];
  const validExpenses = await Expense.find({
    _id: { $in: expenseIds },
    isDeleted: false,
  })
    .select("_id")
    .lean();

  const validExpenseIds = new Set(validExpenses.map((e) => e._id.toString()));

  // Filter participants to only include those with valid expenses
  const validParticipants = participants.filter((p) =>
    validExpenseIds.has(p.expenseId.toString())
  );

  // Group by expense
  const expenseMap = new Map();
  validParticipants.forEach((p: any) => {
    const expenseId = p.expenseId.toString();
    if (!expenseMap.has(expenseId)) {
      expenseMap.set(expenseId, []);
    }
    expenseMap.get(expenseId).push(p);
  });

  let balance = 0;

  // Calculate balance for each expense
  expenseMap.forEach((parts) => {
    const user1Part = parts.find(
      (p: any) => p.userId.toString() === id1.toString()
    );
    const user2Part = parts.find(
      (p: any) => p.userId.toString() === id2.toString()
    );

    if (user1Part && user2Part) {
      // How much user1 paid minus how much they owe
      const user1Net = user1Part.paidAmount - user1Part.owedAmount;
      balance += user1Net;
    }
  });

  // Subtract settled amounts
  const settlements = await Settlement.find({
    $or: [
      { fromUserId: id1, toUserId: id2 },
      { fromUserId: id2, toUserId: id1 },
    ],
  })
    .select("fromUserId toUserId amount")
    .lean();

  settlements.forEach((settlement) => {
    if (settlement.fromUserId.toString() === id1.toString()) {
      balance -= settlement.amount;
    } else {
      balance += settlement.amount;
    }
  });

  return Number(balance.toFixed(2));
}

/**
 * Get all balances for a user (with all their friends)
 */
export async function getUserBalances(
  userId: string | mongoose.Types.ObjectId
): Promise<Map<string, number>> {
  const id = new mongoose.Types.ObjectId(userId);

  // Get all expenses where user is a participant
  const participants = await ExpenseParticipant.find({
    userId: id,
    isSettled: false,
  })
    .select("expenseId userId paidAmount owedAmount")
    .lean();

  const expenseIds = participants.map((p: any) => p.expenseId);

  // Filter for non-deleted expenses in one query
  const validExpenses = await Expense.find({
    _id: { $in: expenseIds },
    isDeleted: false,
  }).select('_id').lean();

  const validExpenseIds = new Set(validExpenses.map(e => e._id.toString()));

  // Filter participants to only include those with valid expenses
  const validParticipants = participants.filter(p =>
    validExpenseIds.has(p.expenseId.toString())
  );

  // Get all participants for valid expenses
  const allParticipants = await ExpenseParticipant.find({
    expenseId: { $in: Array.from(validExpenseIds) },
    isSettled: false,
  })
    .select("expenseId userId paidAmount owedAmount")
    .lean();

  // Calculate balances
  const balances = new Map<string, number>();

  // Group by expense
  const expenseMap = new Map();
  allParticipants.forEach((p: any) => {
    const expenseId = p.expenseId.toString();
    if (!expenseMap.has(expenseId)) {
      expenseMap.set(expenseId, []);
    }
    expenseMap.get(expenseId).push(p);
  });

  // Calculate balance for each expense
  expenseMap.forEach((parts: any[]) => {
    const userPart = parts.find(
      (p) => p.userId.toString() === id.toString()
    );

    if (!userPart) return;

    parts.forEach((otherPart) => {
      if (otherPart.userId.toString() === id.toString()) return;

      const otherUserId = otherPart.userId.toString();
      const currentBalance = balances.get(otherUserId) || 0;

      // How much user paid minus how much they owe
      const userNet = userPart.paidAmount - userPart.owedAmount;
      const otherNet = otherPart.paidAmount - otherPart.owedAmount;

      // If user paid more than they owe, others owe them
      if (userNet > 0) {
        const share = (userNet * otherPart.owedAmount) / (userPart.paidAmount || 1);
        balances.set(otherUserId, currentBalance + share);
      } else if (userNet < 0) {
        // User owes others
        const share = (Math.abs(userNet) * otherPart.paidAmount) / (parts.reduce((sum, p) => sum + p.paidAmount, 0) - userPart.paidAmount || 1);
        balances.set(otherUserId, currentBalance - share);
      }
    });
  });

  // Apply settlements
  const settlements = await Settlement.find({
    $or: [{ fromUserId: id }, { toUserId: id }],
  })
    .select("fromUserId toUserId amount")
    .lean();

  settlements.forEach((settlement: any) => {
    const otherUserId =
      settlement.fromUserId.toString() === id.toString()
        ? settlement.toUserId.toString()
        : settlement.fromUserId.toString();

    const currentBalance = balances.get(otherUserId) || 0;

    if (settlement.fromUserId.toString() === id.toString()) {
      // User paid settlement
      balances.set(otherUserId, currentBalance - settlement.amount);
    } else {
      // User received settlement
      balances.set(otherUserId, currentBalance + settlement.amount);
    }
  });

  // Round all balances
  balances.forEach((value, key) => {
    balances.set(key, Number(value.toFixed(2)));
  });

  return balances;
}

/**
 * Get total balance for a user (sum of all balances)
 */
export async function getTotalBalance(
  userId: string | mongoose.Types.ObjectId
): Promise<{ total: number; youOwe: number; youAreOwed: number }> {
  const balances = await getUserBalances(userId);

  let youOwe = 0;
  let youAreOwed = 0;

  balances.forEach((balance) => {
    if (balance < 0) {
      youOwe += Math.abs(balance);
    } else if (balance > 0) {
      youAreOwed += balance;
    }
  });

  return {
    total: Number((youAreOwed - youOwe).toFixed(2)),
    youOwe: Number(youOwe.toFixed(2)),
    youAreOwed: Number(youAreOwed.toFixed(2)),
  };
}

/**
 * Simplified debt structure for a group of users
 * Uses greedy algorithm to minimize number of transactions
 */
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

/**
 * Simplify debts among a group of users to minimize transactions
 * @param userIds - Array of user IDs to simplify debts for
 * @returns Simplified list of transactions
 */
export async function simplifyGroupDebts(
  userIds: (string | mongoose.Types.ObjectId)[]
): Promise<SimplifiedDebts> {
  const objectIds = userIds.map(id => new mongoose.Types.ObjectId(id));
  const idStrings = userIds.map(id => id.toString());

  // Get all expense participants for users in the group
  const participants = await ExpenseParticipant.find({
    userId: { $in: objectIds },
    isSettled: false,
  })
    .select("expenseId userId paidAmount owedAmount")
    .lean();

  const expenseIds = participants.map(p => p.expenseId);

  // Filter for non-deleted expenses
  const validExpenses = await Expense.find({
    _id: { $in: expenseIds },
    isDeleted: false,
  }).select('_id').lean();

  const validExpenseIds = new Set(validExpenses.map(e => e._id.toString()));

  // Filter participants to valid expenses
  const validParticipants = participants.filter(p =>
    validExpenseIds.has(p.expenseId.toString())
  );

  // Get all participants for valid expenses
  const allParticipants = await ExpenseParticipant.find({
    expenseId: { $in: Array.from(validExpenseIds) },
    isSettled: false,
  })
    .select("expenseId userId paidAmount owedAmount")
    .lean();

  // Calculate balances in memory
  const balanceMap = new Map<string, number>();

  // Group by expense and calculate balances
  const expenseMap = new Map();
  allParticipants.forEach((p: any) => {
    const expenseId = p.expenseId.toString();
    if (!expenseMap.has(expenseId)) {
      expenseMap.set(expenseId, []);
    }
    expenseMap.get(expenseId).push(p);
  });

  expenseMap.forEach((parts: any[]) => {
    parts.forEach((userPart) => {
      const userId = userPart.userId.toString();
      if (!idStrings.includes(userId)) return;

      parts.forEach((otherPart) => {
        if (userPart.userId.toString() === otherPart.userId.toString()) return;

        const otherUserId = otherPart.userId.toString();
        if (!idStrings.includes(otherUserId)) return;

        const userNet = userPart.paidAmount - userPart.owedAmount;
        const otherNet = otherPart.paidAmount - otherPart.owedAmount;

        // Net effect on user's balance with other user
        const balanceChange = userNet;

        const currentBalance = balanceMap.get(userId) || 0;
        balanceMap.set(userId, currentBalance + balanceChange);
      });
    });
  });

  // Apply settlements
  const settlements = await Settlement.find({
    $or: [
      { fromUserId: { $in: objectIds } },
      { toUserId: { $in: objectIds } },
    ],
  })
    .select("fromUserId toUserId amount")
    .lean();

  settlements.forEach((settlement: any) => {
    const fromUserId = settlement.fromUserId.toString();
    const toUserId = settlement.toUserId.toString();

    if (idStrings.includes(fromUserId) && idStrings.includes(toUserId)) {
      const fromBalance = balanceMap.get(fromUserId) || 0;
      balanceMap.set(fromUserId, fromBalance - settlement.amount);

      const toBalance = balanceMap.get(toUserId) || 0;
      balanceMap.set(toUserId, toBalance + settlement.amount);
    }
  });

  // Count original transactions (every non-zero balance pair)
  let originalCount = 0;
  balanceMap.forEach((balance) => {
    if (Math.abs(balance) > 0.01) originalCount++;
  });
  originalCount = Math.floor(originalCount / 2);

  // Separate debtors and creditors
  const debtors: Array<{ id: string; amount: number }> = [];
  const creditors: Array<{ id: string; amount: number }> = [];

  balanceMap.forEach((balance, userId) => {
    const roundedBalance = Number(balance.toFixed(2));
    if (roundedBalance < -0.01) {
      debtors.push({ id: userId, amount: Math.abs(roundedBalance) });
    } else if (roundedBalance > 0.01) {
      creditors.push({ id: userId, amount: roundedBalance });
    }
  });

  // Sort for greedy algorithm
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  // Greedy algorithm to minimize transactions
  const transactions: SimplifiedDebt[] = [];
  let i = 0,
    j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0.01) {
      transactions.push({
        from: debtor.id,
        to: creditor.id,
        amount: Number(settleAmount.toFixed(2)),
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return {
    transactions,
    originalCount: Math.max(originalCount, transactions.length),
    optimizedCount: transactions.length,
  };
}

/**
 * Get simplified debts for a specific group
 * @param groupId - Group ID
 * @returns Simplified debts with user information
 */
export async function getGroupSimplifiedDebts(
  groupId: string | mongoose.Types.ObjectId
) {
  const GroupMember = (await import("@/models/GroupMember")).default;
  const User = (await import("@/models/User")).default;

  const members = await GroupMember.find({ groupId }).select("userId");
  const userIds = members.map((m: any) => m.userId);

  const simplified = await simplifyGroupDebts(userIds);

  // Populate user information
  const transactionsWithUsers = await Promise.all(
    simplified.transactions.map(async (t) => {
      const [fromUser, toUser] = await Promise.all([
        User.findById(t.from).select("name email profilePicture"),
        User.findById(t.to).select("name email profilePicture"),
      ]);

      return {
        from: {
          id: t.from,
          name: fromUser?.name || "Unknown",
          email: fromUser?.email || "",
          profilePicture: fromUser?.profilePicture,
        },
        to: {
          id: t.to,
          name: toUser?.name || "Unknown",
          email: toUser?.email || "",
          profilePicture: toUser?.profilePicture,
        },
        amount: t.amount,
      };
    })
  );

  return {
    transactions: transactionsWithUsers,
    originalCount: simplified.originalCount,
    optimizedCount: simplified.optimizedCount,
    savings: simplified.originalCount - simplified.optimizedCount,
  };
}

import mongoose from "mongoose";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";

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
 * Calculate balance between two users
 */
export async function calculateBalanceBetweenUsers(
  userId1: string | mongoose.Types.ObjectId,
  userId2: string | mongoose.Types.ObjectId
): Promise<number> {
  const id1 = new mongoose.Types.ObjectId(userId1);
  const id2 = new mongoose.Types.ObjectId(userId2);

  // Get all expense participants for both users
  const participants = await ExpenseParticipant.find({
    userId: { $in: [id1, id2] },
    isSettled: false,
  }).populate({
    path: "expenseId",
    match: { isDeleted: false },
  });

  // Group by expense
  const expenseMap = new Map();
  participants.forEach((p: any) => {
    if (!p.expenseId) return;
    const expenseId = p.expenseId._id.toString();
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
  });

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
    .populate({
      path: "expenseId",
      match: { isDeleted: false },
    })
    .lean();

  const expenseIds = participants
    .filter((p: any) => p.expenseId)
    .map((p: any) => p.expenseId._id);

  // Get all participants for those expenses
  const allParticipants = await ExpenseParticipant.find({
    expenseId: { $in: expenseIds },
    isSettled: false,
  }).lean();

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
  }).lean();

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
  // Get all balances between users
  const balanceMap = new Map<string, number>();

  // Calculate net balance for each user
  for (const userId of userIds) {
    const userBalance = await getUserBalances(userId);
    const id = userId.toString();

    if (!balanceMap.has(id)) {
      balanceMap.set(id, 0);
    }

    userBalance.forEach((balance, otherId) => {
      if (userIds.some((uid) => uid.toString() === otherId)) {
        const currentBalance = balanceMap.get(id) || 0;
        balanceMap.set(id, currentBalance + balance);

        const otherBalance = balanceMap.get(otherId) || 0;
        balanceMap.set(otherId, otherBalance - balance);
      }
    });
  }

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

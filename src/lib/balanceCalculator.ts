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

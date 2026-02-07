import mongoose from "mongoose";

export interface Participant {
  userId: string | mongoose.Types.ObjectId;
  paidAmount: number;
  owedAmount: number;
}

export interface SplitEquallyParams {
  amount: number;
  participants: string[] | mongoose.Types.ObjectId[];
  paidBy: string | mongoose.Types.ObjectId;
}

export interface SplitByAmountsParams {
  amount: number;
  participants: Array<{
    userId: string | mongoose.Types.ObjectId;
    owedAmount: number;
  }>;
  paidBy: string | mongoose.Types.ObjectId;
}

export interface SplitByPercentagesParams {
  amount: number;
  participants: Array<{
    userId: string | mongoose.Types.ObjectId;
    percentage: number;
  }>;
  paidBy: string | mongoose.Types.ObjectId;
}

export interface SplitBySharesParams {
  amount: number;
  participants: Array<{
    userId: string | mongoose.Types.ObjectId;
    shares: number;
  }>;
  paidBy: string | mongoose.Types.ObjectId;
}

/**
 * Split amount equally among all participants
 */
export function splitEqually({
  amount,
  participants,
  paidBy,
}: SplitEquallyParams): Participant[] {
  const perPersonAmount = Number((amount / participants.length).toFixed(2));
  let remainder = Number((amount - perPersonAmount * participants.length).toFixed(2));

  return participants.map((userId, index) => {
    const isPayer = userId.toString() === paidBy.toString();
    let owedAmount = perPersonAmount;

    // Distribute remainder to first participant
    if (index === 0 && remainder !== 0) {
      owedAmount = Number((owedAmount + remainder).toFixed(2));
    }

    return {
      userId,
      paidAmount: isPayer ? amount : 0,
      owedAmount,
    };
  });
}

/**
 * Split by exact amounts for each participant
 */
export function splitByExactAmounts({
  amount,
  participants,
  paidBy,
}: SplitByAmountsParams): Participant[] {
  const totalOwed = participants.reduce((sum, p) => sum + p.owedAmount, 0);

  if (Math.abs(totalOwed - amount) > 0.01) {
    throw new Error(
      `Total owed amounts (${totalOwed}) do not match expense amount (${amount})`
    );
  }

  return participants.map((p) => ({
    userId: p.userId,
    paidAmount: p.userId.toString() === paidBy.toString() ? amount : 0,
    owedAmount: Number(p.owedAmount.toFixed(2)),
  }));
}

/**
 * Split by percentages
 */
export function splitByPercentages({
  amount,
  participants,
  paidBy,
}: SplitByPercentagesParams): Participant[] {
  const totalPercentage = participants.reduce((sum, p) => sum + p.percentage, 0);

  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(
      `Total percentages (${totalPercentage}%) must equal 100%`
    );
  }

  let totalCalculated = 0;
  const results: Participant[] = [];

  participants.forEach((p, index) => {
    const isPayer = p.userId.toString() === paidBy.toString();
    let owedAmount: number;

    // Calculate owed amount for last participant to handle rounding
    if (index === participants.length - 1) {
      owedAmount = Number((amount - totalCalculated).toFixed(2));
    } else {
      owedAmount = Number(((amount * p.percentage) / 100).toFixed(2));
      totalCalculated += owedAmount;
    }

    results.push({
      userId: p.userId,
      paidAmount: isPayer ? amount : 0,
      owedAmount,
    });
  });

  return results;
}

/**
 * Split by shares (e.g., 1x, 2x, 3x)
 */
export function splitByShares({
  amount,
  participants,
  paidBy,
}: SplitBySharesParams): Participant[] {
  const totalShares = participants.reduce((sum, p) => sum + p.shares, 0);
  const perShare = amount / totalShares;

  let totalCalculated = 0;
  const results: Participant[] = [];

  participants.forEach((p, index) => {
    const isPayer = p.userId.toString() === paidBy.toString();
    let owedAmount: number;

    // Calculate owed amount for last participant to handle rounding
    if (index === participants.length - 1) {
      owedAmount = Number((amount - totalCalculated).toFixed(2));
    } else {
      owedAmount = Number((perShare * p.shares).toFixed(2));
      totalCalculated += owedAmount;
    }

    results.push({
      userId: p.userId,
      paidAmount: isPayer ? amount : 0,
      owedAmount,
    });
  });

  return results;
}

/**
 * Validate split participants
 */
export function validateSplit(participants: Participant[], amount: number): boolean {
  const totalOwed = participants.reduce((sum, p) => sum + p.owedAmount, 0);
  const totalPaid = participants.reduce((sum, p) => sum + p.paidAmount, 0);

  // Check if amounts match within rounding tolerance
  if (Math.abs(totalOwed - amount) > 0.01) {
    return false;
  }

  if (Math.abs(totalPaid - amount) > 0.01) {
    return false;
  }

  return true;
}

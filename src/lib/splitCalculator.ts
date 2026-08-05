type IdLike = string | { toString(): string };

export interface Participant {
  userId: IdLike;
  paidAmount: number;
  owedAmount: number;
}

export interface PayerShare {
  userId: IdLike;
  amount: number;
}

/** Single payer id, or multiple payers with exact paid amounts (must sum to expense). */
export type PaidByInput = IdLike | PayerShare[];

function idStr(value: IdLike): string {
  return value.toString();
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Resolve how much each user paid.
 * - string/IdLike → that user paid the full amount
 * - PayerShare[] → each entry's amount (must sum to `amount` within 0.01)
 */
export function resolvePaidAmounts(
  amount: number,
  paidBy: PaidByInput
): Map<string, number> {
  const paid = new Map<string, number>();

  if (Array.isArray(paidBy)) {
    if (paidBy.length === 0) {
      throw new Error("At least one payer is required");
    }
    let total = 0;
    for (const payer of paidBy) {
      const userId = idStr(payer.userId);
      if (!userId) continue;
      const share = Number(payer.amount);
      if (!Number.isFinite(share) || share < 0) {
        throw new Error("Payer amounts must be non-negative numbers");
      }
      paid.set(userId, round2((paid.get(userId) || 0) + share));
      total = round2(total + share);
    }
    if (Math.abs(total - amount) > 0.01) {
      throw new Error(
        `Total paid amounts (${total}) do not match expense amount (${amount})`
      );
    }
    return paid;
  }

  const single = idStr(paidBy);
  if (!single) {
    throw new Error("Payer is required");
  }
  paid.set(single, round2(amount));
  return paid;
}

function applyPaidAmounts(
  rows: Array<{ userId: IdLike; owedAmount: number }>,
  paidMap: Map<string, number>
): Participant[] {
  const userIds = new Set([
    ...rows.map((r) => idStr(r.userId)),
    ...paidMap.keys(),
  ]);

  const owedByUser = new Map<string, number>();
  for (const row of rows) {
    const uid = idStr(row.userId);
    owedByUser.set(uid, round2((owedByUser.get(uid) || 0) + row.owedAmount));
  }

  return Array.from(userIds).map((userId) => ({
    userId,
    paidAmount: paidMap.get(userId) || 0,
    owedAmount: owedByUser.get(userId) || 0,
  }));
}

export interface SplitEquallyParams {
  amount: number;
  participants: IdLike[];
  paidBy: PaidByInput;
}

export interface SplitByAmountsParams {
  amount: number;
  participants: Array<{
    userId: IdLike;
    owedAmount: number;
  }>;
  paidBy: PaidByInput;
}

export interface SplitByPercentagesParams {
  amount: number;
  participants: Array<{
    userId: IdLike;
    percentage: number;
  }>;
  paidBy: PaidByInput;
}

export interface SplitBySharesParams {
  amount: number;
  participants: Array<{
    userId: IdLike;
    shares: number;
  }>;
  paidBy: PaidByInput;
}

/**
 * Split amount equally among all participants
 */
export function splitEqually({
  amount,
  participants,
  paidBy,
}: SplitEquallyParams): Participant[] {
  if (participants.length === 0) {
    throw new Error("No participants provided");
  }

  const paidMap = resolvePaidAmounts(amount, paidBy);
  const perPersonAmount = round2(amount / participants.length);
  let remainder = round2(amount - perPersonAmount * participants.length);

  const owedRows = participants.map((userId, index) => {
    let owedAmount = perPersonAmount;
    if (index === 0 && remainder !== 0) {
      owedAmount = round2(owedAmount + remainder);
    }
    return { userId, owedAmount };
  });

  return applyPaidAmounts(owedRows, paidMap);
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

  const paidMap = resolvePaidAmounts(amount, paidBy);
  return applyPaidAmounts(
    participants.map((p) => ({
      userId: p.userId,
      owedAmount: round2(p.owedAmount),
    })),
    paidMap
  );
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
    throw new Error(`Total percentages (${totalPercentage}%) must equal 100%`);
  }

  const paidMap = resolvePaidAmounts(amount, paidBy);
  let totalCalculated = 0;
  const owedRows = participants.map((p, index) => {
    let owedAmount: number;
    if (index === participants.length - 1) {
      owedAmount = round2(amount - totalCalculated);
    } else {
      owedAmount = round2((amount * p.percentage) / 100);
      totalCalculated += owedAmount;
    }
    return { userId: p.userId, owedAmount };
  });

  return applyPaidAmounts(owedRows, paidMap);
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
  if (totalShares <= 0) {
    throw new Error("Total shares must be greater than 0");
  }

  const paidMap = resolvePaidAmounts(amount, paidBy);
  const perShare = amount / totalShares;
  let totalCalculated = 0;

  const owedRows = participants.map((p, index) => {
    let owedAmount: number;
    if (index === participants.length - 1) {
      owedAmount = round2(amount - totalCalculated);
    } else {
      owedAmount = round2(perShare * p.shares);
      totalCalculated += owedAmount;
    }
    return { userId: p.userId, owedAmount };
  });

  return applyPaidAmounts(owedRows, paidMap);
}

/**
 * Validate split participants
 */
export function validateSplit(participants: Participant[], amount: number): boolean {
  const totalOwed = participants.reduce((sum, p) => sum + p.owedAmount, 0);
  const totalPaid = participants.reduce((sum, p) => sum + p.paidAmount, 0);

  if (Math.abs(totalOwed - amount) > 0.01) {
    return false;
  }

  if (Math.abs(totalPaid - amount) > 0.01) {
    return false;
  }

  return true;
}

import "server-only";

import { getMongooseInstance } from "@/lib/mongodb/client";
import {
  Expense,
  ExpenseParticipant,
  SettlementAllocation,
} from "@/lib/mongodb/models";
import {
  chunk,
  round2,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/mongodb/route-helpers";
import { newAppId } from "@/lib/ids";
import { normalizePaymentStatus } from "@/lib/expenses/payment-status";

interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface SettlementAllocationResult {
  allocations: Array<{
    id: string;
    settlementId: string;
    expenseId: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
  }>;
  updatedExpenses: Array<{
    expenseId: string;
    paymentStatus: "unpaid" | "partially_paid" | "paid" | "disputed";
    allocatedAmount: number;
    totalDebtAmount: number;
  }>;
  affectedUserIds: string[];
}

function buildTransfersForExpense(participants: any[]): Transfer[] {
  const netMap = new Map<string, number>();

  for (const participant of participants) {
    const userId = String(participant.user_id || "");
    if (!userId) continue;
    const net = toNum(participant.amount_paid) - toNum(participant.amount_owed);
    netMap.set(userId, round2((netMap.get(userId) || 0) + net));
  }

  const debtors: Array<{ userId: string; amount: number }> = [];
  const creditors: Array<{ userId: string; amount: number }> = [];
  for (const [userId, net] of netMap.entries()) {
    if (net < -0.01) {
      debtors.push({ userId, amount: round2(Math.abs(net)) });
    } else if (net > 0.01) {
      creditors.push({ userId, amount: round2(net) });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));
    if (amount > 0.01) {
      transfers.push({ from: debtor.userId, to: creditor.userId, amount });
    }
    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);
    if (debtor.amount <= 0.01) i += 1;
    if (creditor.amount <= 0.01) j += 1;
  }

  return transfers;
}

async function fetchParticipantsByExpenseIds(expenseIds: string[]): Promise<any[]> {
  const ids = uniqueStrings(expenseIds);
  if (ids.length === 0) return [];
  return ExpenseParticipant.find({ expense_id: { $in: ids } }).lean();
}

async function fetchAllocationsByExpenseIds(expenseIds: string[]): Promise<any[]> {
  const ids = uniqueStrings(expenseIds);
  if (ids.length === 0) return [];
  return SettlementAllocation.find({ expense_id: { $in: ids } }).lean();
}

function toDateMs(value: any): number {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function allocateSettlementToExpenses(input: {
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  groupId?: string | null;
  actorId: string;
}): Promise<SettlementAllocationResult> {
  const amount = round2(Number(input.amount || 0));
  if (!input.settlementId || !input.fromUserId || !input.toUserId || amount <= 0) {
    return { allocations: [], updatedExpenses: [], affectedUserIds: [] };
  }

  const [fromParticipants, toParticipants] = await Promise.all([
    ExpenseParticipant.find({ user_id: input.fromUserId }).lean(),
    ExpenseParticipant.find({ user_id: input.toUserId }).lean(),
  ]);

  const fromExpenseIds = new Set(
    fromParticipants.map((doc: any) => String(doc.expense_id || ""))
  );
  const sharedExpenseIds = uniqueStrings(
    toParticipants
      .map((doc: any) => String(doc.expense_id || ""))
      .filter((expenseId) => fromExpenseIds.has(expenseId))
  );
  if (sharedExpenseIds.length === 0) {
    return { allocations: [], updatedExpenses: [], affectedUserIds: [] };
  }

  const expenses = await Expense.find({
    _id: { $in: sharedExpenseIds },
    is_deleted: { $ne: true },
  }).lean();

  const candidateExpenses = expenses
    .filter((e: any) => normalizePaymentStatus(e.payment_status, "unpaid") !== "disputed")
    .filter((e: any) => normalizePaymentStatus(e.payment_status, "unpaid") !== "paid")
    .filter((e: any) => {
      if (input.groupId === undefined || input.groupId === null || input.groupId === "") return true;
      return String(e.group_id || "") === String(input.groupId);
    })
    .sort((a: any, b: any) => {
      const left = toDateMs(a.date || a.created_at);
      const right = toDateMs(b.date || b.created_at);
      return left - right;
    });

  if (candidateExpenses.length === 0) {
    return { allocations: [], updatedExpenses: [], affectedUserIds: [] };
  }

  const candidateExpenseIds = candidateExpenses.map((e: any) => String(e._id || ""));
  const participantRows = await fetchParticipantsByExpenseIds(candidateExpenseIds);
  const existingAllocations = await fetchAllocationsByExpenseIds(candidateExpenseIds);

  const participantsByExpense = new Map<string, any[]>();
  for (const participant of participantRows) {
    const expenseId = String(participant.expense_id || "");
    const rows = participantsByExpense.get(expenseId) || [];
    rows.push(participant);
    participantsByExpense.set(expenseId, rows);
  }

  const allocationsByExpense = new Map<string, any[]>();
  for (const allocation of existingAllocations) {
    const expenseId = String(allocation.expense_id || "");
    const rows = allocationsByExpense.get(expenseId) || [];
    rows.push(allocation);
    allocationsByExpense.set(expenseId, rows);
  }

  let remaining = amount;
  const createdAllocations: SettlementAllocationResult["allocations"] = [];
  const updatedExpenses: SettlementAllocationResult["updatedExpenses"] = [];
  const now = new Date();
  const mongoose = getMongooseInstance();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      for (const expense of candidateExpenses) {
        if (remaining <= 0.01) break;

        const expenseId = String(expense._id || (expense as any).id || "");
        const participants = participantsByExpense.get(expenseId) || [];
        const transfers = buildTransfersForExpense(participants);
        const matchingDebt = transfers
          .filter((t) => t.from === input.fromUserId && t.to === input.toUserId)
          .reduce((sum, t) => round2(sum + t.amount), 0);
        if (matchingDebt <= 0.01) continue;

        const existingForDirection = (allocationsByExpense.get(expenseId) || [])
          .filter(
            (a: any) =>
              String(a.from_user_id || "") === input.fromUserId &&
              String(a.to_user_id || "") === input.toUserId
          )
          .reduce((sum, a: any) => round2(sum + toNum(a.amount)), 0);
        const directionOutstanding = round2(matchingDebt - existingForDirection);
        if (directionOutstanding <= 0.01) continue;

        const allocationAmount = round2(Math.min(remaining, directionOutstanding));
        const allocationId = `${input.settlementId}_${expenseId}_${input.fromUserId}_${input.toUserId}`;

        await SettlementAllocation.create(
          [{
            _id: allocationId,
            settlement_id: input.settlementId,
            expense_id: expenseId,
            from_user_id: input.fromUserId,
            to_user_id: input.toUserId,
            amount: allocationAmount,
            created_by: input.actorId,
            created_at: now,
          }],
          { session }
        );

        createdAllocations.push({
          id: allocationId,
          settlementId: input.settlementId,
          expenseId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amount: allocationAmount,
        });
        remaining = round2(remaining - allocationAmount);

        const allExpenseDebt = transfers.reduce((sum, t) => round2(sum + t.amount), 0);
        const existingAllocatedTotal = (allocationsByExpense.get(expenseId) || [])
          .reduce((sum, a: any) => round2(sum + toNum(a.amount)), 0);
        const nextAllocatedTotal = round2(existingAllocatedTotal + allocationAmount);
        const nextStatus = nextAllocatedTotal >= allExpenseDebt - 0.01 ? "paid" : "partially_paid";

        await Expense.updateOne(
          { _id: expenseId },
          {
            $set: {
              payment_status: nextStatus,
              payment_status_updated_at: now,
              payment_status_updated_by: input.actorId,
              settlement_allocated_amount: nextAllocatedTotal,
              settlement_total_debt_amount: allExpenseDebt,
              updated_at: now,
            },
          },
          { session }
        );

        updatedExpenses.push({
          expenseId,
          paymentStatus: nextStatus,
          allocatedAmount: nextAllocatedTotal,
          totalDebtAmount: allExpenseDebt,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  return {
    allocations: createdAllocations,
    updatedExpenses,
    affectedUserIds: uniqueStrings(
      participantRows
        .filter((participant) =>
          updatedExpenses.some((expense) => expense.expenseId === String(participant.expense_id || ""))
        )
        .map((participant) => String(participant.user_id || ""))
    ),
  };
}

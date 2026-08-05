import "server-only";

import { getDynamoDB } from "@/lib/dynamodb/client";
import { TABLE } from "@/lib/dynamodb/tables";
import { PK, SK } from "@/lib/dynamodb/keys";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { queryAll } from "@/lib/dynamodb/helpers";
import {
  listExpenseIdsByParticipant,
  listExpenseParticipants,
  getExpensesByIds,
} from "@/lib/dynamodb/entities/expenses";
import { updateExpensePaymentStatusInDynamo } from "@/lib/dynamodb/write-operations";
import { round2, toIso, toNum, uniqueStrings } from "@/lib/firestore/route-helpers";

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
  if (expenseIds.length === 0) return [];
  const arrays = await Promise.all(expenseIds.map(eid => listExpenseParticipants(eid)));
  return arrays.flat();
}

async function fetchAllocationsForExpense(expenseId: string): Promise<any[]> {
  return queryAll<any>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": PK.expense(expenseId),
      ":prefix": "ALLOC#",
    },
  });
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

  // 1. Get all expense IDs for fromUserId and toUserId
  const [fromExpenseObjs, toExpenseObjs] = await Promise.all([
    listExpenseIdsByParticipant(input.fromUserId),
    listExpenseIdsByParticipant(input.toUserId),
  ]);

  const fromExpenseIds = new Set(fromExpenseObjs.map((e) => e.expense_id));
  const sharedExpenseIds = uniqueStrings(
    toExpenseObjs
      .map((e) => e.expense_id)
      .filter((eid) => fromExpenseIds.has(eid))
  );

  if (sharedExpenseIds.length === 0) {
    return { allocations: [], updatedExpenses: [], affectedUserIds: [] };
  }

  // 2. Fetch candidate expenses
  const expenses = await getExpensesByIds(sharedExpenseIds);

  const candidateExpenses = expenses
    .filter((e) => !e.is_deleted)
    .filter((e) => e.payment_status !== "disputed")
    .filter((e) => e.payment_status !== "paid")
    .filter((e) => {
      if (input.groupId === undefined || input.groupId === null || input.groupId === "") return true;
      return String(e.group_id || "") === String(input.groupId);
    })
    .sort((a, b) => {
      const left = toDateMs(a.date || a.created_at);
      const right = toDateMs(b.date || b.created_at);
      return left - right;
    });

  if (candidateExpenses.length === 0) {
    return { allocations: [], updatedExpenses: [], affectedUserIds: [] };
  }

  const candidateExpenseIds = candidateExpenses.map((e) => e.id);

  // 3. Fetch participants and existing allocations for candidate expenses
  const [participantRows, existingAllocationsArray] = await Promise.all([
    fetchParticipantsByExpenseIds(candidateExpenseIds),
    Promise.all(candidateExpenseIds.map((eid) => fetchAllocationsForExpense(eid))),
  ]);
  const existingAllocations = existingAllocationsArray.flat();

  const participantsByExpense = new Map<string, any[]>();
  for (const participant of participantRows) {
    const expenseId = participant.expense_id;
    const rows = participantsByExpense.get(expenseId) || [];
    rows.push(participant);
    participantsByExpense.set(expenseId, rows);
  }

  const allocationsByExpense = new Map<string, any[]>();
  for (const allocation of existingAllocations) {
    const expenseId = allocation.expense_id;
    const rows = allocationsByExpense.get(expenseId) || [];
    rows.push(allocation);
    allocationsByExpense.set(expenseId, rows);
  }

  let remaining = amount;
  const createdAllocations: SettlementAllocationResult["allocations"] = [];
  const updatedExpenses: SettlementAllocationResult["updatedExpenses"] = [];
  const now = new Date();
  const client = getDynamoDB();

  for (const expense of candidateExpenses) {
    if (remaining <= 0.01) break;

    const expenseId = expense.id;
    const participants = participantsByExpense.get(expenseId) || [];
    const transfers = buildTransfersForExpense(participants);
    const matchingDebt = transfers
      .filter((t) => t.from === input.fromUserId && t.to === input.toUserId)
      .reduce((sum, t) => round2(sum + t.amount), 0);
    if (matchingDebt <= 0.01) continue;

    const existingForDirection = (allocationsByExpense.get(expenseId) || [])
      .filter(
        (a) =>
          String(a.from_user_id || "") === input.fromUserId &&
          String(a.to_user_id || "") === input.toUserId
      )
      .reduce((sum, a) => round2(sum + (a.amount || 0)), 0);
    const directionOutstanding = round2(matchingDebt - existingForDirection);
    if (directionOutstanding <= 0.01) continue;

    const allocationAmount = round2(Math.min(remaining, directionOutstanding));
    const allocationId = `${input.settlementId}_${expenseId}_${input.fromUserId}_${input.toUserId}`;

    // Write allocation to SETTLEMENT#<settlementId> / ALLOC#<expenseId>
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: PK.settlement(input.settlementId),
        SK: SK.alloc(expenseId),
        entityType: "settlement_allocation",
        settlement_id: input.settlementId,
        expense_id: expenseId,
        amount: allocationAmount,
        from_user_id: input.fromUserId,
        to_user_id: input.toUserId,
        created_by: input.actorId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
    }));

    // Write allocation to EXPENSE#<expenseId> / ALLOC#<settlementId>#<fromUserId>#<toUserId>
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: PK.expense(expenseId),
        SK: `ALLOC#${input.settlementId}#${input.fromUserId}#${input.toUserId}`,
        entityType: "settlement_allocation",
        settlement_id: input.settlementId,
        expense_id: expenseId,
        amount: allocationAmount,
        from_user_id: input.fromUserId,
        to_user_id: input.toUserId,
        created_by: input.actorId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
    }));

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
      .reduce((sum, a) => round2(sum + (a.amount || 0)), 0);
    const nextAllocatedTotal = round2(existingAllocatedTotal + allocationAmount);
    const nextStatus = nextAllocatedTotal >= allExpenseDebt - 0.01 ? "paid" : "partially_paid";

    // Update payment status in DynamoDB (and propagate to participants and feed items)
    await updateExpensePaymentStatusInDynamo(
      expenseId,
      nextStatus,
      input.actorId,
      now.toISOString()
    );

    updatedExpenses.push({
      expenseId,
      paymentStatus: nextStatus,
      allocatedAmount: nextAllocatedTotal,
      totalDebtAmount: allExpenseDebt,
    });
  }

  return {
    allocations: createdAllocations,
    updatedExpenses,
    affectedUserIds: uniqueStrings(
      participantRows
        .filter((participant) =>
          updatedExpenses.some((expense) => expense.expenseId === participant.expense_id)
        )
        .map((participant) => participant.user_id)
    ),
  };
}

import { Expense, ExpenseParticipant, Settlement } from "@/lib/mongodb/models";
import {
  chunk,
  round2,
  toNum as toNumber,
  uniqueStrings,
} from "@/lib/mongodb/route-helpers";

interface Transfer {
  from: string;
  to: string;
  amount: number;
}

function buildTransfersForExpense(participants: any[]): Transfer[] {
  const netMap = new Map<string, number>();

  for (const participant of participants) {
    const userId = String(participant.user_id || "");
    if (!userId) {
      continue;
    }
    const net = toNumber(participant.amount_paid) - toNumber(participant.amount_owed);
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
    const settled = round2(Math.min(debtor.amount, creditor.amount));
    if (settled > 0.01) {
      transfers.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: settled,
      });
    }

    debtor.amount = round2(debtor.amount - settled);
    creditor.amount = round2(creditor.amount - settled);

    if (debtor.amount <= 0.01) {
      i += 1;
    }
    if (creditor.amount <= 0.01) {
      j += 1;
    }
  }

  return transfers;
}

interface PairwiseBalanceOptions {
  friendIds?: string[];
  groupId?: string | null;
}

export async function computePairwiseBalancesForUser(
  userId: string,
  options: PairwiseBalanceOptions = {}
): Promise<Map<string, number>> {
  const friendFilter = options.friendIds
    ? new Set(uniqueStrings(options.friendIds))
    : null;
  const balances = new Map<string, number>();

  // ── Step 1: Find all expense_participant docs for this user ──
  const participantLinks = await ExpenseParticipant.find({ user_id: userId }).lean();
  const allExpenseIds = uniqueStrings(
    participantLinks.map((doc: any) => String(doc.expense_id || ""))
  );

  // ── Step 2: Filter valid (non-deleted) expenses matching group filter ──
  const validExpenseIds: string[] = [];
  if (allExpenseIds.length > 0) {
    const expenseQuery: Record<string, unknown> = {
      _id: { $in: allExpenseIds },
      is_deleted: { $ne: true },
    };

    // Apply group filter
    if (options.groupId === "non-group") {
      expenseQuery.group_id = { $in: [null, "", undefined] };
    } else if (options.groupId && options.groupId !== "non-group") {
      expenseQuery.group_id = options.groupId;
    }

    const expenses = await Expense.find(expenseQuery, { _id: 1 }).lean();
    validExpenseIds.push(...expenses.map((e: any) => String(e._id)));
  }

  // ── Step 3: Fetch all participants for valid expenses ──
  if (validExpenseIds.length > 0) {
    const participantsByExpense = new Map<string, any[]>();

    // MongoDB $in supports large arrays — no need for Firestore's 10-item chunking
    const allParticipants = await ExpenseParticipant.find({
      expense_id: { $in: validExpenseIds },
    }).lean();

    for (const row of allParticipants) {
      const eid = String(row.expense_id || "");
      const list = participantsByExpense.get(eid) || [];
      list.push(row);
      participantsByExpense.set(eid, list);
    }

    // ── Step 4: Compute pairwise transfers ──
    for (const rows of participantsByExpense.values()) {
      const transfers = buildTransfersForExpense(rows);
      for (const transfer of transfers) {
        if (transfer.from === userId || transfer.to === userId) {
          const otherUserId = transfer.from === userId ? transfer.to : transfer.from;
          if (!otherUserId || otherUserId === userId) continue;
          if (friendFilter && !friendFilter.has(otherUserId)) continue;
          const delta = transfer.to === userId ? transfer.amount : -transfer.amount;
          balances.set(otherUserId, round2((balances.get(otherUserId) || 0) + delta));
        }
      }
    }
  }

  // ── Step 5: Factor in settlements ──
  const settlementRows = await Settlement.find({
    $or: [{ from_user_id: userId }, { to_user_id: userId }],
  }).lean();

  for (const row of settlementRows) {
    const fromUserId = String(row.from_user_id || "");
    const toUserId = String(row.to_user_id || "");
    const amount = toNumber(row.amount);
    if (amount <= 0) continue;

    if (options.groupId === "non-group" && row.group_id) {
      continue;
    }
    if (options.groupId && options.groupId !== "non-group") {
      if (String(row.group_id || "") !== options.groupId) {
        continue;
      }
    }

    if (fromUserId === userId && toUserId) {
      if (!friendFilter || friendFilter.has(toUserId)) {
        balances.set(toUserId, round2((balances.get(toUserId) || 0) + amount));
      }
    } else if (toUserId === userId && fromUserId) {
      if (!friendFilter || friendFilter.has(fromUserId)) {
        balances.set(fromUserId, round2((balances.get(fromUserId) || 0) - amount));
      }
    }
  }

  return balances;
}

export async function computeGroupMemberNetBalances(
  groupId: string,
  memberIds: string[] = []
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  for (const memberId of uniqueStrings(memberIds)) {
    balances.set(memberId, 0);
  }

  // ── Find all non-deleted expenses in this group ──
  const expenses = await Expense.find(
    { group_id: groupId, is_deleted: { $ne: true } },
    { _id: 1 }
  ).lean();
  const expenseIds = expenses.map((e: any) => String(e._id));

  // ── Compute net balances from expense participants ──
  if (expenseIds.length > 0) {
    const participants = await ExpenseParticipant.find({
      expense_id: { $in: expenseIds },
    }).lean();

    for (const row of participants) {
      const uid = String(row.user_id || "");
      if (!uid) continue;
      const delta = toNumber(row.amount_paid) - toNumber(row.amount_owed);
      balances.set(uid, round2((balances.get(uid) || 0) + delta));
    }
  }

  // ── Factor in settlements ──
  const settlements = await Settlement.find({ group_id: groupId }).lean();
  for (const row of settlements) {
    const fromUserId = String(row.from_user_id || "");
    const toUserId = String(row.to_user_id || "");
    const amount = toNumber(row.amount);
    if (amount <= 0) continue;

    if (fromUserId) {
      balances.set(fromUserId, round2((balances.get(fromUserId) || 0) + amount));
    }
    if (toUserId) {
      balances.set(toUserId, round2((balances.get(toUserId) || 0) - amount));
    }
  }

  return balances;
}

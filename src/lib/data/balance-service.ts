import { getAdminDb } from "@/lib/firestore/admin";

function toNumber(value: unknown): number {
  return Number(value || 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

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
    const net = toNumber(participant.paid_amount) - toNumber(participant.owed_amount);
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
  const db = getAdminDb();
  const friendFilter = options.friendIds
    ? new Set(uniqueStrings(options.friendIds))
    : null;
  const balances = new Map<string, number>();

  const participantLinksSnap = await db
    .collection("expense_participants")
    .where("user_id", "==", userId)
    .get();

  const allExpenseIds = uniqueStrings(
    participantLinksSnap.docs.map((doc) => String(doc.data()?.expense_id || ""))
  );

  const validExpenseIds: string[] = [];
  if (allExpenseIds.length > 0) {
    for (const idChunk of chunk(allExpenseIds, 200)) {
      const refs = idChunk.map((id) => db.collection("expenses").doc(id));
      const docs = await db.getAll(...refs);
      for (const doc of docs) {
        if (!doc.exists) {
          continue;
        }
        const row = doc.data() || {};
        if (row.is_deleted) {
          continue;
        }
        const rowGroupId = row.group_id ? String(row.group_id) : "";
        if (options.groupId === "non-group" && rowGroupId) {
          continue;
        }
        if (options.groupId && options.groupId !== "non-group" && rowGroupId !== options.groupId) {
          continue;
        }
        validExpenseIds.push(String(row.id || doc.id));
      }
    }
  }

  if (validExpenseIds.length > 0) {
    const participantsByExpense = new Map<string, any[]>();
    for (const idChunk of chunk(validExpenseIds, 30)) {
      const snap = await db
        .collection("expense_participants")
        .where("expense_id", "in", idChunk)
        .get();
      for (const doc of snap.docs) {
        const row: any = { id: doc.id, ...(doc.data() || {}) };
        const expenseId = String(row.expense_id || "");
        const list = participantsByExpense.get(expenseId) || [];
        list.push(row);
        participantsByExpense.set(expenseId, list);
      }
    }

    for (const rows of participantsByExpense.values()) {
      const transfers = buildTransfersForExpense(rows);
      for (const transfer of transfers) {
        if (transfer.from === userId || transfer.to === userId) {
          const otherUserId = transfer.from === userId ? transfer.to : transfer.from;
          if (!otherUserId || otherUserId === userId) {
            continue;
          }
          if (friendFilter && !friendFilter.has(otherUserId)) {
            continue;
          }
          const delta = transfer.to === userId ? transfer.amount : -transfer.amount;
          balances.set(otherUserId, round2((balances.get(otherUserId) || 0) + delta));
        }
      }
    }
  }

  const fromSnap = await db
    .collection("settlements")
    .where("from_user_id", "==", userId)
    .get();
  const toSnap = await db
    .collection("settlements")
    .where("to_user_id", "==", userId)
    .get();

  const settlementRows: any[] = [...fromSnap.docs, ...toSnap.docs].map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));

  for (const row of settlementRows) {
    const fromUserId = String(row.from_user_id || "");
    const toUserId = String(row.to_user_id || "");
    const amount = toNumber(row.amount);
    if (amount <= 0) {
      continue;
    }

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
        balances.set(toUserId, round2((balances.get(toUserId) || 0) - amount));
      }
    } else if (toUserId === userId && fromUserId) {
      if (!friendFilter || friendFilter.has(fromUserId)) {
        balances.set(fromUserId, round2((balances.get(fromUserId) || 0) + amount));
      }
    }
  }

  return balances;
}

export async function computeGroupMemberNetBalances(
  groupId: string,
  memberIds: string[] = []
): Promise<Map<string, number>> {
  const db = getAdminDb();
  const balances = new Map<string, number>();

  for (const memberId of uniqueStrings(memberIds)) {
    balances.set(memberId, 0);
  }

  const expensesSnap = await db.collection("expenses").where("group_id", "==", groupId).get();
  const expenseIds = expensesSnap.docs
    .filter((doc) => !doc.data()?.is_deleted)
    .map((doc) => String(doc.data()?.id || doc.id));

  if (expenseIds.length > 0) {
    for (const idChunk of chunk(expenseIds, 30)) {
      const participantsSnap = await db
        .collection("expense_participants")
        .where("expense_id", "in", idChunk)
        .get();

      for (const doc of participantsSnap.docs) {
        const row = doc.data() || {};
        const userId = String(row.user_id || "");
        if (!userId) {
          continue;
        }
        const delta = toNumber(row.paid_amount) - toNumber(row.owed_amount);
        balances.set(userId, round2((balances.get(userId) || 0) + delta));
      }
    }
  }

  const settlementsSnap = await db
    .collection("settlements")
    .where("group_id", "==", groupId)
    .get();

  for (const doc of settlementsSnap.docs) {
    const row = doc.data() || {};
    const fromUserId = String(row.from_user_id || "");
    const toUserId = String(row.to_user_id || "");
    const amount = toNumber(row.amount);
    if (amount <= 0) {
      continue;
    }

    if (fromUserId) {
      balances.set(fromUserId, round2((balances.get(fromUserId) || 0) - amount));
    }
    if (toUserId) {
      balances.set(toUserId, round2((balances.get(toUserId) || 0) + amount));
    }
  }

  return balances;
}

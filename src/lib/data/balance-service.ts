/**
 * Shared group balance engine — DynamoDB-only.
 *
 * Net convention (same as simplified-debts):
 *   expense:  balance += amount_paid − amount_owed  (converted to group currency)
 *   settlement from A → B of X:  A += X, B −= X
 */
import { listGroupMembers, getGroupById } from "@/lib/dynamodb/entities/groups";
import {
  listExpenseParticipants,
  queryGroupExpenseFeed,
  getExpensesByIds,
} from "@/lib/dynamodb/entities/expenses";
import { queryGroupSettlements } from "@/lib/dynamodb/entities/settlements";
import { convertAmountSync, getRatesToInr } from "@/lib/fx";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type GroupNetBalances = Map<string, number>;

/**
 * Build per-member net balances for a group (expenses + settlements).
 * Expense amounts are converted into the group's currency when needed.
 * Throws on data-layer failure so callers can distinguish error from true zeros.
 */
export async function computeGroupMemberNetBalances(
  groupId: string
): Promise<GroupNetBalances> {
  if (!groupId) {
    return new Map();
  }

  const [members, group, rates] = await Promise.all([
    listGroupMembers(groupId),
    getGroupById(groupId),
    getRatesToInr(),
  ]);
  const groupCurrency = String(group?.currency || "INR");

  const balances: GroupNetBalances = new Map(
    members.map((m) => [String(m.user_id || ""), 0] as [string, number])
  );
  balances.delete("");

  const { items: expenses } = await queryGroupExpenseFeed(groupId, 5000);
  const expenseIds = expenses
    .map((e) => String(e.expense_id || ""))
    .filter(Boolean);

  // Prefer META currency when feed is missing it
  const expenseCurrencyById = new Map<string, string>();
  for (const e of expenses) {
    if (e.expense_id && e.currency) {
      expenseCurrencyById.set(String(e.expense_id), String(e.currency));
    }
  }
  const missingCurrencyIds = expenseIds.filter((id) => !expenseCurrencyById.has(id));
  if (missingCurrencyIds.length > 0) {
    const metas = await getExpensesByIds(missingCurrencyIds);
    for (const meta of metas) {
      if (meta?.id) {
        expenseCurrencyById.set(meta.id, String(meta.currency || groupCurrency));
      }
    }
  }

  if (expenseIds.length > 0) {
    const participantLists = await Promise.all(
      expenseIds.map((eid) => listExpenseParticipants(eid))
    );

    for (let i = 0; i < expenseIds.length; i++) {
      const expenseId = expenseIds[i];
      const expenseCurrency = expenseCurrencyById.get(expenseId) || groupCurrency;
      const participants = participantLists[i] || [];

      for (const participant of participants) {
        const userId = String(participant.user_id || "");
        if (!userId || !balances.has(userId)) continue;
        const rawDelta =
          toNum(participant.amount_paid) - toNum(participant.amount_owed);
        const delta = convertAmountSync(
          rawDelta,
          expenseCurrency,
          groupCurrency,
          rates
        );
        balances.set(userId, round2((balances.get(userId) || 0) + delta));
      }
    }
  }

  const { items: settlementFeed } = await queryGroupSettlements(groupId, 5000);
  const seenSettlementIds = new Set<string>();

  for (const settlement of settlementFeed) {
    const settlementId = String(settlement.settlement_id || "");
    if (settlementId) {
      if (seenSettlementIds.has(settlementId)) continue;
      seenSettlementIds.add(settlementId);
    }
    if (settlement.is_deleted) continue;

    const from = String(settlement.from_user_id || "");
    const to = String(settlement.to_user_id || "");
    const rawAmount = toNum(settlement.amount);
    if (rawAmount <= 0) continue;

    const settlementCurrency = String(settlement.currency || groupCurrency);
    const amount = convertAmountSync(
      rawAmount,
      settlementCurrency,
      groupCurrency,
      rates
    );

    if (from && balances.has(from)) {
      balances.set(from, round2((balances.get(from) || 0) + amount));
    }
    if (to && balances.has(to)) {
      balances.set(to, round2((balances.get(to) || 0) - amount));
    }
  }

  return balances;
}

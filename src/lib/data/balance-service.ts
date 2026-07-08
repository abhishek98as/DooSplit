/**
 * Balance computation — DynamoDB-only.
 */
import { dynamodbReadRepository } from "./dynamodb-adapter";

const repo = dynamodbReadRepository;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeGroupMemberNetBalances(groupId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  try {
    const members = await repo.getGroupMembers(groupId);
    const expenses = await repo.getGroupExpenses(groupId);

    for (const m of members) balances.set(m.userId, 0);

    for (const exp of expenses) {
      const participants = await repo.getExpenseParticipants(exp.id);
      for (const p of participants) {
        const current = balances.get(p.userId) || 0;
        balances.set(p.userId, round2(current + (p.amountPaid || 0) - (p.amountOwed || 0)));
      }
    }
  } catch {
    // If DynamoDB query fails, return empty balances
  }

  return balances;
}

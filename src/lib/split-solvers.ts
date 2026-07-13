/**
 * DooSplit Split Solvers — Client Side
 * Contains greedy cash-flow simplification and direct proportional pairwise split calculations.
 */

export interface GroupBalance {
  userId: string;
  userName: string;
  balance: number;
}

export interface SimplifiedDebtTransaction {
  from: {
    id: string;
    name: string;
  };
  to: {
    id: string;
    name: string;
  };
  amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Greedy Settle Pass (Simplified Debts Solver / Min Cash-flow Solver)
 * Finds the minimum number of transactions needed to settle a set of net balances.
 */
export function simplifyGroupDebtsLocal(balances: GroupBalance[]): SimplifiedDebtTransaction[] {
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ userId: b.userId, userName: b.userName, balance: Math.abs(round2(b.balance)) }))
    .sort((a, b) => b.balance - a.balance);

  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ userId: b.userId, userName: b.userName, balance: round2(b.balance) }))
    .sort((a, b) => b.balance - a.balance);

  const transactions: SimplifiedDebtTransaction[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.balance, creditor.balance);

    if (amount > 0.01) {
      transactions.push({
        from: { id: debtor.userId, name: debtor.userName },
        to: { id: creditor.userId, name: creditor.userName },
        amount: round2(amount),
      });
    }

    debtor.balance = round2(debtor.balance - amount);
    creditor.balance = round2(creditor.balance - amount);

    if (debtor.balance <= 0.01) i++;
    if (creditor.balance <= 0.01) j++;
  }

  return transactions;
}

/**
 * Direct Proportional Pairwise Solver (Simplification OFF)
 * Computes exact splits from the actual expenses without running a minimization pass.
 */
export function computeDirectGroupDebts(
  expenses: any[],
  members: Array<{ userId: string; userName: string }>
): SimplifiedDebtTransaction[] {
  const memberIds = members.map((m) => m.userId);
  const debts = new Map<string, Map<string, number>>();

  for (const m1 of memberIds) {
    debts.set(m1, new Map<string, number>());
    for (const m2 of memberIds) {
      debts.get(m1)!.set(m2, 0);
    }
  }

  for (const exp of expenses) {
    const participants = exp.participants || [];
    const totalPaid = participants.reduce((sum: number, p: any) => sum + (p.paidAmount || 0), 0);
    if (totalPaid <= 0) continue;

    for (const p of participants) {
      const payerId = typeof p.userId === "object" ? p.userId?._id || p.userId?.id : String(p.userId);
      const paid = p.paidAmount || 0;
      if (paid <= 0) continue;

      const ratio = paid / totalPaid;

      for (const q of participants) {
        const debtorId = typeof q.userId === "object" ? q.userId?._id || q.userId?.id : String(q.userId);
        if (payerId === debtorId) continue;
        const owed = q.owedAmount || 0;
        if (owed <= 0) continue;

        const share = owed * ratio;
        const current = debts.get(debtorId)?.get(payerId) || 0;
        debts.get(debtorId)?.set(payerId, current + share);
      }
    }
  }

  const transactions: SimplifiedDebtTransaction[] = [];
  const processed = new Set<string>();

  for (const m1 of memberIds) {
    for (const m2 of memberIds) {
      if (m1 === m2) continue;
      const key = [m1, m2].sort().join("-");
      if (processed.has(key)) continue;
      processed.add(key);

      const m1OwesM2 = debts.get(m1)?.get(m2) || 0;
      const m2OwesM1 = debts.get(m2)?.get(m1) || 0;

      const m1User = members.find((m) => m.userId === m1) || { userId: m1, userName: "Unknown" };
      const m2User = members.find((m) => m.userId === m2) || { userId: m2, userName: "Unknown" };

      if (m1OwesM2 > m2OwesM1) {
        const net = m1OwesM2 - m2OwesM1;
        if (net > 0.01) {
          transactions.push({
            from: { id: m1, name: m1User.userName },
            to: { id: m2, name: m2User.userName },
            amount: round2(net),
          });
        }
      } else if (m2OwesM1 > m1OwesM2) {
        const net = m2OwesM1 - m1OwesM2;
        if (net > 0.01) {
          transactions.push({
            from: { id: m2, name: m2User.userName },
            to: { id: m1, name: m1User.userName },
            amount: round2(net),
          });
        }
      }
    }
  }

  return transactions;
}

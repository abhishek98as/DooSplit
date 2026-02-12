import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

interface NetEntry {
  userId: string;
  amount: number;
}

interface SimplifiedTx {
  from: string;
  to: string;
  amount: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function simplifyFromNet(netMap: Map<string, number>) {
  const debtors: NetEntry[] = [];
  const creditors: NetEntry[] = [];
  for (const [userId, amount] of netMap.entries()) {
    const rounded = round2(amount);
    if (rounded < -0.01) {
      debtors.push({ userId, amount: Math.abs(rounded) });
    } else if (rounded > 0.01) {
      creditors.push({ userId, amount: rounded });
    }
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const txs: SimplifiedTx[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settled = Math.min(debtor.amount, creditor.amount);
    if (settled > 0.01) {
      txs.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: round2(settled),
      });
    }
    debtor.amount = round2(debtor.amount - settled);
    creditor.amount = round2(creditor.amount - settled);
    if (debtor.amount <= 0.01) i += 1;
    if (creditor.amount <= 0.01) j += 1;
  }

  const nonZeroCount = Array.from(netMap.values()).filter((v) => Math.abs(v) > 0.01).length;
  const originalCount = Math.max(Math.floor(nonZeroCount / 2), txs.length);
  return {
    transactions: txs,
    originalCount,
    optimizedCount: txs.length,
    savings: originalCount - txs.length,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) {
      throw membershipError;
    }
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    const cacheKey = buildUserScopedCacheKey("groups", userId, `debts:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const { data: groupMembers, error: membersError } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", id);
      if (membersError) {
        throw membersError;
      }
      const memberIds = Array.from(
        new Set((groupMembers || []).map((m: any) => String(m.user_id)))
      );
      if (memberIds.length === 0) {
        return {
          transactions: [],
          originalCount: 0,
          optimizedCount: 0,
          savings: 0,
          message: "Already optimized!",
        };
      }

      const netMap = new Map(memberIds.map((memberId) => [memberId, 0]));

      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("id")
        .eq("group_id", id)
        .eq("is_deleted", false);
      if (expensesError) {
        throw expensesError;
      }
      const expenseIds = (expenses || []).map((expense: any) => String(expense.id));
      if (expenseIds.length > 0) {
        const { data: participants, error: participantsError } = await supabase
          .from("expense_participants")
          .select("user_id,paid_amount,owed_amount")
          .in("expense_id", expenseIds);
        if (participantsError) {
          throw participantsError;
        }
        for (const participant of participants || []) {
          const participantUserId = String(participant.user_id);
          if (!netMap.has(participantUserId)) {
            continue;
          }
          const delta =
            Number(participant.paid_amount || 0) - Number(participant.owed_amount || 0);
          netMap.set(participantUserId, round2((netMap.get(participantUserId) || 0) + delta));
        }
      }

      const { data: settlements, error: settlementsError } = await supabase
        .from("settlements")
        .select("from_user_id,to_user_id,amount")
        .eq("group_id", id);
      if (settlementsError) {
        throw settlementsError;
      }
      for (const settlement of settlements || []) {
        const from = String(settlement.from_user_id);
        const to = String(settlement.to_user_id);
        const amount = Number(settlement.amount || 0);
        if (netMap.has(from)) {
          netMap.set(from, round2((netMap.get(from) || 0) - amount));
        }
        if (netMap.has(to)) {
          netMap.set(to, round2((netMap.get(to) || 0) + amount));
        }
      }

      const simplified = simplifyFromNet(netMap);
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id,name,email,profile_picture")
        .in("id", memberIds);
      if (usersError) {
        throw usersError;
      }
      const usersMap = new Map((users || []).map((u: any) => [String(u.id), u]));

      const transactions = simplified.transactions.map((tx) => {
        const fromUser = usersMap.get(tx.from);
        const toUser = usersMap.get(tx.to);
        return {
          from: {
            id: tx.from,
            name: fromUser?.name || "Unknown",
            email: fromUser?.email || "",
            profilePicture: fromUser?.profile_picture || null,
          },
          to: {
            id: tx.to,
            name: toUser?.name || "Unknown",
            email: toUser?.email || "",
            profilePicture: toUser?.profile_picture || null,
          },
          amount: tx.amount,
        };
      });

      return {
        transactions,
        originalCount: simplified.originalCount,
        optimizedCount: simplified.optimizedCount,
        savings: simplified.savings,
        message:
          simplified.savings > 0
            ? `Optimized ${simplified.originalCount} transactions to ${simplified.optimizedCount}, saving ${simplified.savings} transaction${simplified.savings !== 1 ? "s" : ""}!`
            : "Already optimized!",
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    console.error("Get simplified debts error:", error);
    return NextResponse.json(
      { error: "Failed to calculate simplified debts" },
      { status: 500 }
    );
  }
}

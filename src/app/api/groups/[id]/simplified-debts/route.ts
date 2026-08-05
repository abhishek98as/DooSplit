import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { computeGroupMemberNetBalances } from "@/lib/data/balance-service";
import { uniqueStrings } from "@/lib/mongodb/route-helpers";

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

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
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
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const { getGroupMember, listGroupMembers } = await import(
      "@/lib/dynamodb/entities/groups"
    );
    const membership = await getGroupMember(id, userId);
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    const cacheKey = buildUserScopedCacheKey("groups", userId, `debts:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const groupMembers = await listGroupMembers(id);
      const memberIds = uniqueStrings(
        groupMembers.map((doc) => String(doc.user_id || ""))
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

      const netMap = await computeGroupMemberNetBalances(id);
      const simplified = simplifyFromNet(netMap);

      const { getUsersByIds } = await import("@/lib/dynamodb/entities/users");
      const users = await getUsersByIds(memberIds);
      const usersMap = new Map(
        users.map((u) => [
          u.id,
          {
            name: u.name || "Unknown",
            email: u.email || "",
            profilePicture: u.photo_url || null,
          },
        ])
      );

      const transactions = simplified.transactions.map((tx) => {
        const fromUser = usersMap.get(tx.from);
        const toUser = usersMap.get(tx.to);
        return {
          from: {
            id: tx.from,
            name: fromUser?.name || "Unknown",
            email: fromUser?.email || "",
            profilePicture: fromUser?.profilePicture || null,
          },
          to: {
            id: tx.to,
            name: toUser?.name || "Unknown",
            email: toUser?.email || "",
            profilePicture: toUser?.profilePicture || null,
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

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: unknown) {
    console.error("Get simplified debts error:", error);
    return NextResponse.json(
      { error: "Failed to calculate simplified debts" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { fetchDocsByIds, round2, toNum, uniqueStrings } from "@/lib/firestore/route-helpers";

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
    const db = getAdminDb();

    const membershipSnap = await db
      .collection("group_members")
      .where("group_id", "==", id)
      .where("user_id", "==", userId)
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    const cacheKey = buildUserScopedCacheKey("groups", userId, `debts:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const groupMembersSnap = await db
        .collection("group_members")
        .where("group_id", "==", id)
        .get();
      const memberIds = uniqueStrings(
        groupMembersSnap.docs.map((doc) => String(doc.data()?.user_id || ""))
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

      const netMap = new Map<string, number>(
        memberIds.map((memberId) => [String(memberId), 0] as [string, number])
      );

      const expensesSnap = await db
        .collection("expenses")
        .where("group_id", "==", id)
        .where("is_deleted", "==", false)
        .get();
      const expenseIds = expensesSnap.docs.map((doc) => String(doc.data()?.id || doc.id));

      if (expenseIds.length > 0) {
        for (const expenseIdChunk of (() => {
          const chunks: string[][] = [];
          for (let i = 0; i < expenseIds.length; i += 10) {
            chunks.push(expenseIds.slice(i, i + 10));
          }
          return chunks;
        })()) {
          const participantsSnap = await db
            .collection("expense_participants")
            .where("expense_id", "in", expenseIdChunk)
            .get();
          for (const participantDoc of participantsSnap.docs) {
            const participant = participantDoc.data() || {};
            const participantUserId = String(participant.user_id || "");
            if (!netMap.has(participantUserId)) {
              continue;
            }
            const delta = toNum(participant.paid_amount) - toNum(participant.owed_amount);
            netMap.set(participantUserId, round2((netMap.get(participantUserId) || 0) + delta));
          }
        }
      }

      const settlementsSnap = await db
        .collection("settlements")
        .where("group_id", "==", id)
        .get();
      for (const settlementDoc of settlementsSnap.docs) {
        const settlement = settlementDoc.data() || {};
        const from = String(settlement.from_user_id || "");
        const to = String(settlement.to_user_id || "");
        const amount = toNum(settlement.amount);
        if (netMap.has(from)) {
          netMap.set(from, round2((netMap.get(from) || 0) - amount));
        }
        if (netMap.has(to)) {
          netMap.set(to, round2((netMap.get(to) || 0) + amount));
        }
      }

      const simplified = simplifyFromNet(netMap);
      const usersMap = await fetchDocsByIds("users", memberIds);

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

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Get simplified debts error:", error);
    return NextResponse.json(
      { error: "Failed to calculate simplified debts" },
      { status: 500 }
    );
  }
}

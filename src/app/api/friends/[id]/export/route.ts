import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getFriendshipStatus } from "@/lib/social/friendship-store";
import { getUserById } from "@/lib/dynamodb/entities/users";
import {
  listExpenseIdsByParticipant,
  getExpensesByIds,
  listExpenseParticipants,
} from "@/lib/dynamodb/entities/expenses";
import { queryUserSettlementFeed } from "@/lib/dynamodb/entities/settlements";
import { getGroupById } from "@/lib/dynamodb/entities/groups";

export const dynamic = "force-dynamic";

function csvRow(values: unknown[]): string {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const friendId = id;

    const friendship = await getFriendshipStatus(userId, friendId);
    if (friendship.status !== "accepted") {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const friendUser = await getUserById(friendId);
    const friendName = friendUser?.name || "Friend";

    const myExpenseRefs = await listExpenseIdsByParticipant(userId);
    const friendExpenseRefs = await listExpenseIdsByParticipant(friendId);
    const friendExpenseIds = new Set(friendExpenseRefs.map((r) => r.expense_id));
    const pairExpenseIds = myExpenseRefs
      .map((r) => r.expense_id)
      .filter((eid) => friendExpenseIds.has(eid));

    let expenses: any[] = [];
    const expenseList: any[] = [];
    if (pairExpenseIds.length > 0) {
      expenses = await getExpensesByIds(pairExpenseIds);
      expenses = expenses.filter((e) => e && !e.is_deleted);

      for (const expense of expenses) {
        const participants = await listExpenseParticipants(expense.id);
        const userParticipant = participants.find((p) => p.user_id === userId);
        if (!userParticipant) continue;

        let groupName = "";
        if (expense.group_id) {
          const group = await getGroupById(expense.group_id);
          groupName = group?.name || "";
        }

        expenseList.push({
          date: expense.date || expense.created_at,
          description: expense.description,
          category: expense.category || "Other",
          amountPaid: Number(userParticipant.amount_paid || 0),
          amountOwed: Number(userParticipant.amount_owed || 0),
          groupName,
          type: "Expense",
          status: userParticipant.is_settled ? "Settled" : "Unsettled",
        });
      }
    }

    const { items: allSettlements } = await queryUserSettlementFeed(userId, 2000);
    const settlements = allSettlements.filter(
      (s) =>
        !s.is_deleted &&
        ((s.from_user_id === userId && s.to_user_id === friendId) ||
          (s.from_user_id === friendId && s.to_user_id === userId))
    );

    const settlementList = await Promise.all(
      settlements.map(async (settlement) => {
        let groupName = "";
        if (settlement.group_id) {
          const group = await getGroupById(settlement.group_id);
          groupName = group?.name || "";
        }

        const isFromUser = settlement.from_user_id === userId;
        return {
          date: settlement.date,
          description: isFromUser ? `Paid to ${friendName}` : `Received from ${friendName}`,
          category: "Payment",
          amountPaid: isFromUser ? Number(settlement.amount || 0) : 0,
          amountOwed: isFromUser ? 0 : Number(settlement.amount || 0),
          groupName,
          type: "Settlement",
          status: "Settled",
        };
      })
    );

    const allItems = [...expenseList, ...settlementList].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const csvHeaders = ["Date", "Description", "Category", "Amount Paid", "Amount Owed", "Group Name", "Type", "Status"];
    const csvLines = [
      csvHeaders.join(","),
      ...allItems.map((item) =>
        csvRow([
          item.date,
          item.description,
          item.category,
          item.amountPaid,
          item.amountOwed,
          item.groupName,
          item.type,
          item.status,
        ])
      ),
    ];

    const csvData = csvLines.join("\n");
    const safeFriendName = friendName.toLowerCase().replace(/[^a-z0-9]/g, "_");

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="doosplit_report_${safeFriendName}.csv"`,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Export friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to export transactions" },
      { status: 500 }
    );
  }
}

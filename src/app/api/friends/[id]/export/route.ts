import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { fetchDocsByIds, toIso, toNum, uniqueStrings } from "@/lib/firestore/route-helpers";
import { getFriendshipStatus } from "@/lib/social/friendship-store";

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

    const db = getAdminDb();
    const [userParticipantsSnap, friendParticipantsSnap] = await Promise.all([
      db.collection("expense_participants").where("user_id", "==", userId).get(),
      db.collection("expense_participants").where("user_id", "==", friendId).get(),
    ]);

    const pairParticipants: any[] = [
      ...userParticipantsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      })),
      ...friendParticipantsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      })),
    ];

    const pairByExpense = new Map<string, any[]>();
    for (const participant of pairParticipants || []) {
      const expenseId = String(participant.expense_id || "");
      const list = pairByExpense.get(expenseId) || [];
      list.push(participant);
      pairByExpense.set(expenseId, list);
    }

    const expenseIds = Array.from(pairByExpense.entries())
      .filter(([, participants]) => {
        const users = new Set(participants.map((participant) => String(participant.user_id || "")));
        return users.has(userId) && users.has(friendId);
      })
      .map(([expenseId]) => expenseId);

    const expensesById = await fetchDocsByIds("expenses", expenseIds);
    const expenses = Array.from(expensesById.values())
      .filter((row: any) => !row.is_deleted)
      .sort((a, b) => {
        const aMs = new Date(toIso(a.date || a.created_at || a._created_at)).getTime();
        const bMs = new Date(toIso(b.date || b.created_at || b._created_at)).getTime();
        return bMs - aMs;
      });

    const settledByExpense = new Map<string, boolean>();
    for (const expenseId of expenseIds) {
      const snap = await db
        .collection("expense_participants")
        .where("expense_id", "==", expenseId)
        .get();
      for (const doc of snap.docs) {
        const row = doc.data() || {};
        const key = String(row.expense_id || "");
        if (!settledByExpense.has(key)) {
          settledByExpense.set(key, true);
        }
        if (!row.is_settled) {
          settledByExpense.set(key, false);
        }
      }
    }

    const groupIds = uniqueStrings(
      expenses
        .map((expense: any) => (expense.group_id ? String(expense.group_id) : ""))
        .filter(Boolean)
    );
    const groupsMap = await fetchDocsByIds("groups", groupIds);

    const [outgoingSettlementsSnap, incomingSettlementsSnap] = await Promise.all([
      db
        .collection("settlements")
        .where("from_user_id", "==", userId)
        .where("to_user_id", "==", friendId)
        .get(),
      db
        .collection("settlements")
        .where("from_user_id", "==", friendId)
        .where("to_user_id", "==", userId)
        .get(),
    ]);
    const settlementRows: any[] = [
      ...outgoingSettlementsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      })),
      ...incomingSettlementsSnap.docs.map((doc) => ({
        id: doc.id,
        ...((doc.data() as any) || {}),
      })),
    ].sort((a: any, b: any) => {
      const aMs = new Date(toIso(a.date || a.created_at || a._created_at)).getTime();
      const bMs = new Date(toIso(b.date || b.created_at || b._created_at)).getTime();
      return bMs - aMs;
    });

    const usersMap = await fetchDocsByIds("users", [userId, friendId]);

    const expenseRows: string[][] = [];
    expenseRows.push([
      "Date",
      "Description",
      "Category",
      "Amount",
      "Your Share",
      "Group",
      "Type",
      "Status",
    ]);

    for (const expense of expenses) {
      const participants = pairByExpense.get(String(expense.id || "")) || [];
      const userParticipant = participants.find(
        (participant: any) => String(participant.user_id || "") === userId
      );
      const friendParticipant = participants.find(
        (participant: any) => String(participant.user_id || "") === friendId
      );
      if (!userParticipant || !friendParticipant) {
        continue;
      }

      const isSettled = settledByExpense.get(String(expense.id || "")) ?? false;
      const userShare = toNum(userParticipant.owed_amount);
      const amount = toNum(expense.amount);
      const currency = String(expense.currency || "INR");
      const symbol = currency === "INR" ? "INR " : `${currency} `;
      const dateIso = toIso(expense.date || expense.created_at || expense._created_at);

      expenseRows.push([
        dateIso ? new Date(dateIso).toLocaleDateString() : "",
        String(expense.description || ""),
        String(expense.category || "other").charAt(0).toUpperCase() +
          String(expense.category || "other").slice(1),
        `${symbol}${amount.toFixed(2)}`,
        `${symbol}${userShare.toFixed(2)}`,
        expense.group_id ? groupsMap.get(String(expense.group_id))?.name || "Group" : "Non-Group",
        toNum(userParticipant.paid_amount) > 0 ? "Paid" : "Owed",
        isSettled ? "Settled" : "Outstanding",
      ]);
    }

    const settlementRowsCsv: string[][] = [];
    settlementRowsCsv.push(["Date", "Description", "Amount", "Type"]);

    for (const settlement of settlementRows || []) {
      const isFromUser = String(settlement.from_user_id || "") === userId;
      const otherUser = isFromUser
        ? usersMap.get(String(settlement.to_user_id || ""))
        : usersMap.get(String(settlement.from_user_id || ""));
      const action = isFromUser ? "Paid" : "Received";
      const currency = String(settlement.currency || "INR");
      const symbol = currency === "INR" ? "INR " : `${currency} `;
      const dateIso = toIso(settlement.date || settlement.created_at || settlement._created_at);

      settlementRowsCsv.push([
        dateIso ? new Date(dateIso).toLocaleDateString() : "",
        `Settlement - ${action} ${otherUser?.name || "Unknown"}`,
        `${symbol}${toNum(settlement.amount).toFixed(2)}`,
        action,
      ]);
    }

    const allRows = [
      ["EXPENSES"],
      ...expenseRows,
      [""],
      ["SETTLEMENTS"],
      ...settlementRowsCsv,
    ];

    const csvContent = allRows.map((row) => csvRow(row)).join("\n");
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="friend-expenses-${friendId}.csv"`,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Export friend expenses error:", error);
    return NextResponse.json(
      { error: "Failed to export expenses" },
      { status: 500 }
    );
  }
}

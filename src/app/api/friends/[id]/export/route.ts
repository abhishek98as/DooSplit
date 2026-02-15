import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

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
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const friendId = id;
    const supabase = requireSupabaseAdmin();

    const { data: friendship, error: friendshipError } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${friendId},status.eq.accepted),and(user_id.eq.${friendId},friend_id.eq.${userId},status.eq.accepted)`
      )
      .limit(1)
      .maybeSingle();
    if (friendshipError) {
      throw friendshipError;
    }
    if (!friendship) {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const { data: pairParticipants, error: pairParticipantsError } = await supabase
      .from("expense_participants")
      .select("expense_id,user_id,paid_amount,owed_amount,is_settled")
      .in("user_id", [userId, friendId]);
    if (pairParticipantsError) {
      throw pairParticipantsError;
    }

    const pairByExpense = new Map<string, any[]>();
    for (const participant of pairParticipants || []) {
      const expenseId = String(participant.expense_id);
      const list = pairByExpense.get(expenseId) || [];
      list.push(participant);
      pairByExpense.set(expenseId, list);
    }

    const expenseIds = Array.from(pairByExpense.entries())
      .filter(([, participants]) => {
        const users = new Set(participants.map((participant) => String(participant.user_id)));
        return users.has(userId) && users.has(friendId);
      })
      .map(([expenseId]) => expenseId);

    let expenses: any[] = [];
    let groupsMap = new Map<string, any>();
    let settledByExpense = new Map<string, boolean>();
    if (expenseIds.length > 0) {
      const { data: expenseRows, error: expensesError } = await supabase
        .from("expenses")
        .select("id,date,description,category,amount,currency,group_id,is_deleted")
        .in("id", expenseIds)
        .eq("is_deleted", false)
        .order("date", { ascending: false });
      if (expensesError) {
        throw expensesError;
      }
      expenses = expenseRows || [];

      const { data: allParticipants, error: allParticipantsError } = await supabase
        .from("expense_participants")
        .select("expense_id,is_settled")
        .in("expense_id", expenseIds);
      if (allParticipantsError) {
        throw allParticipantsError;
      }
      for (const participant of allParticipants || []) {
        const key = String(participant.expense_id);
        if (!settledByExpense.has(key)) {
          settledByExpense.set(key, true);
        }
        if (!participant.is_settled) {
          settledByExpense.set(key, false);
        }
      }

      const groupIds = Array.from(
        new Set(
          expenses
            .map((expense: any) => (expense.group_id ? String(expense.group_id) : ""))
            .filter(Boolean)
        )
      );
      if (groupIds.length > 0) {
        const { data: groups, error: groupsError } = await supabase
          .from("groups")
          .select("id,name")
          .in("id", groupIds);
        if (groupsError) {
          throw groupsError;
        }
        groupsMap = new Map<string, any>((groups || []).map((group: any) => [String(group.id), group]));
      }
    }

    const { data: settlementRows, error: settlementsError } = await supabase
      .from("settlements")
      .select("id,from_user_id,to_user_id,amount,currency,date")
      .or(
        `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`
      )
      .order("date", { ascending: false });
    if (settlementsError) {
      throw settlementsError;
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,name")
      .in("id", [userId, friendId]);
    if (usersError) {
      throw usersError;
    }
    const usersMap = new Map<string, any>((users || []).map((u: any) => [String(u.id), u]));

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
      const participants = pairByExpense.get(String(expense.id)) || [];
      const userParticipant = participants.find(
        (participant: any) => String(participant.user_id) === userId
      );
      const friendParticipant = participants.find(
        (participant: any) => String(participant.user_id) === friendId
      );
      if (!userParticipant || !friendParticipant) {
        continue;
      }

      const isSettled = settledByExpense.get(String(expense.id)) ?? false;
      const userShare = Number(userParticipant.owed_amount || 0);
      const amount = Number(expense.amount || 0);
      const symbol = expense.currency === "INR" ? "INR " : `${expense.currency} `;

      expenseRows.push([
        new Date(expense.date).toLocaleDateString(),
        String(expense.description || ""),
        String(expense.category || "other").charAt(0).toUpperCase() +
          String(expense.category || "other").slice(1),
        `${symbol}${amount.toFixed(2)}`,
        `${symbol}${userShare.toFixed(2)}`,
        expense.group_id ? groupsMap.get(String(expense.group_id))?.name || "Group" : "Non-Group",
        Number(userParticipant.paid_amount || 0) > 0 ? "Paid" : "Owed",
        isSettled ? "Settled" : "Outstanding",
      ]);
    }

    const settlementRowsCsv: string[][] = [];
    settlementRowsCsv.push(["Date", "Description", "Amount", "Type"]);

    for (const settlement of settlementRows || []) {
      const isFromUser = String(settlement.from_user_id) === userId;
      const otherUser = isFromUser
        ? usersMap.get(String(settlement.to_user_id))
        : usersMap.get(String(settlement.from_user_id));
      const action = isFromUser ? "Paid" : "Received";
      const symbol = settlement.currency === "INR" ? "INR " : `${settlement.currency} `;

      settlementRowsCsv.push([
        new Date(settlement.date).toLocaleDateString(),
        `Settlement - ${action} ${otherUser?.name || "Unknown"}`,
        `${symbol}${Number(settlement.amount || 0).toFixed(2)}`,
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


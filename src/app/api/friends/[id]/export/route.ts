import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import Group from "@/models/Group";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);
    const friendId = new mongoose.Types.ObjectId(id);

    // Verify friendship exists
    const Friend = (await import("@/models/Friend")).default;
    const friendship = await Friend.findOne({
      $or: [
        { userId: session.user.id, friendId: id },
        { userId: id, friendId: session.user.id }
      ],
      status: "accepted"
    });

    if (!friendship) {
      return NextResponse.json(
        { error: "Friend not found" },
        { status: 404 }
      );
    }

    // Get expense participants
    const expenseParticipants = await ExpenseParticipant.find({
      userId: { $in: [userId, friendId] }
    });

    const expenseIds = [...new Set(expenseParticipants.map(ep => ep.expenseId.toString()))];

    // Get all expenses with this friend
    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      isDeleted: false
    })
      .populate("createdBy", "name")
      .populate("groupId", "name")
      .sort({ date: -1 });

    // Get settlements
    const settlements = await Settlement.find({
      $or: [
        { fromUserId: userId, toUserId: friendId },
        { fromUserId: friendId, toUserId: userId }
      ]
    })
      .populate("fromUserId", "name")
      .populate("toUserId", "name")
      .sort({ date: -1 });

    // Format expenses for CSV
    const expenseRows = [];
    expenseRows.push(['Date', 'Description', 'Category', 'Amount', 'Your Share', 'Group', 'Type', 'Status']);

    for (const expense of expenses) {
      const participants = expenseParticipants.filter(ep => ep.expenseId.toString() === expense._id.toString());
      const userParticipant = participants.find(p => p.userId.toString() === session.user.id);
      const friendParticipant = participants.find(p => p.userId.toString() === friendId.toString());

      if (userParticipant && friendParticipant) {
        const isSettled = participants.every(p => p.isSettled);
        const userShare = userParticipant.owedAmount;

        expenseRows.push([
          new Date(expense.date).toLocaleDateString(),
          expense.description,
          expense.category.charAt(0).toUpperCase() + expense.category.slice(1),
          `₹${expense.amount.toFixed(2)}`,
          `₹${userShare.toFixed(2)}`,
          expense.groupId?.name || 'Non-Group',
          userParticipant.paidAmount > 0 ? 'Paid' : 'Owed',
          isSettled ? 'Settled' : 'Outstanding'
        ]);
      }
    }

    // Format settlements for CSV
    const settlementRows = [];
    settlementRows.push(['Date', 'Description', 'Amount', 'Type']);

    settlements.forEach(settlement => {
      const isFromUser = settlement.fromUserId._id.toString() === session.user.id;
      const action = isFromUser ? 'Paid' : 'Received';

      settlementRows.push([
        new Date(settlement.date).toLocaleDateString(),
        `Settlement - ${action} ${isFromUser ? settlement.toUserId.name : settlement.fromUserId.name}`,
        `₹${settlement.amount.toFixed(2)}`,
        action
      ]);
    });

    // Combine all rows
    const allRows = [
      ['EXPENSES'],
      ...expenseRows,
      [''], // Empty row
      ['SETTLEMENTS'],
      ...settlementRows
    ];

    // Convert to CSV
    const csvContent = allRows.map(row =>
      row.map(field => `"${field}"`).join(',')
    ).join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="friend-expenses-${id}.csv"`
      }
    });
  } catch (error: any) {
    console.error("Export friend expenses error:", error);
    return NextResponse.json(
      { error: "Failed to export expenses" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import dbConnect from "@/lib/db";
import Friend from "@/models/Friend";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Settlement from "@/models/Settlement";
import Group from "@/models/Group";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

// GET /api/friends/[id]/transactions - Get transaction history with a friend
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

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);
    const friendId = new mongoose.Types.ObjectId(id);

    // Verify they are friends
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

    const transactions: any[] = [];

    // Get expenses where both users are participants
    const expenseParticipants = await ExpenseParticipant.find({
      userId: { $in: [userId, friendId] },
      expenseId: {
        $in: await ExpenseParticipant.distinct("expenseId", {
          userId: { $in: [userId, friendId] }
        })
      }
    }).populate("expenseId");

    // Group by expense and filter to only expenses where both are participants
    const expenseMap = new Map();

    expenseParticipants.forEach((participant: any) => {
      const expenseId = participant.expenseId._id.toString();
      if (!expenseMap.has(expenseId)) {
        expenseMap.set(expenseId, {
          expense: participant.expenseId,
          participants: []
        });
      }
      expenseMap.get(expenseId).participants.push(participant);
    });

    // Only include expenses where both users are participants
    const mutualExpenses = Array.from(expenseMap.values()).filter(
      (item: any) => item.participants.length >= 2
    );

    mutualExpenses.forEach((item: any) => {
      const expense = item.expense;
      const userParticipant = item.participants.find(
        (p: any) => p.userId.toString() === session.user.id
      );

      if (userParticipant && !expense.isDeleted) {
        transactions.push({
          id: expense._id,
          type: "expense",
          description: expense.description,
          amount: userParticipant.owedAmount,
          currency: expense.currency,
          createdAt: expense.createdAt,
          isSettlement: false,
          group: expense.groupId ? {
            id: expense.groupId,
            name: "Group" // Will be populated below
          } : null
        });
      }
    });

    // Get settlements between the two users
    const settlements = await Settlement.find({
      $or: [
        { fromUserId: userId, toUserId: friendId },
        { fromUserId: friendId, toUserId: userId }
      ]
    }).sort({ createdAt: -1 });

    settlements.forEach((settlement: any) => {
      const isFromUser = settlement.fromUserId.toString() === session.user.id;
      const amount = isFromUser ? settlement.amount : -settlement.amount;

      transactions.push({
        id: settlement._id,
        type: "settlement",
        description: isFromUser
          ? `You paid ${settlement.amount} ${settlement.currency}`
          : `Received payment of ${settlement.amount} ${settlement.currency}`,
        amount: Math.abs(amount),
        currency: settlement.currency,
        createdAt: settlement.createdAt,
        isSettlement: true
      });
    });

    // Populate group names
    const groupIds = transactions
      .filter(t => t.group)
      .map(t => t.group.id)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    if (groupIds.length > 0) {
      const groups = await Group.find({ _id: { $in: groupIds } }).select("name");
      const groupMap = new Map(groups.map(g => [g._id.toString(), g.name]));

      transactions.forEach(transaction => {
        if (transaction.group) {
          transaction.group.name = groupMap.get(transaction.group.id.toString()) || "Group";
        }
      });
    }

    // Sort transactions by date (newest first) and limit
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      transactions: transactions.slice(0, limit)
    });
  } catch (error: any) {
    console.error("Friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend transactions" },
      { status: 500 }
    );
  }
}
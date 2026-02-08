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

    const transactions: any[] = [];

    // Get expenses where both users are participants
    const expenseParticipants = await ExpenseParticipant.find({
      userId: { $in: [userId, friendId] }
    });

    const expenseIds = [...new Set(expenseParticipants.map(ep => ep.expenseId.toString()))];

    for (const expenseId of expenseIds) {
      const participants = expenseParticipants.filter(ep => ep.expenseId.toString() === expenseId);
      if (participants.length >= 2) { // Both users are in this expense
        const expense = await Expense.findById(expenseId)
          .populate("createdBy", "name profilePicture")
          .populate("groupId", "name")
          .lean();

        if (expense && !expense.isDeleted) {
          const userParticipant = participants.find(p => p.userId.toString() === session.user.id);
          const friendParticipant = participants.find(p => p.userId.toString() === friendId.toString());

          if (userParticipant && friendParticipant) {
            // Check if all participants are settled
            const allParticipants = await ExpenseParticipant.find({ expenseId: expense._id });
            const isSettled = allParticipants.every(p => p.isSettled);

            const netAmount = userParticipant.owedAmount;
            const isPositive = userParticipant.paidAmount > userParticipant.owedAmount;

            transactions.push({
              id: expense._id,
              type: "expense",
              description: expense.description,
              amount: Math.abs(netAmount),
              currency: expense.currency,
              createdAt: expense.createdAt,
              isSettlement: false,
              settled: isSettled,
              group: expense.groupId ? {
                id: (expense.groupId as any)._id,
                name: (expense.groupId as any).name
              } : null,
              isPositive,
              user: {
                id: (expense.createdBy as any)._id,
                name: (expense.createdBy as any).name,
                profilePicture: (expense.createdBy as any).profilePicture
              }
            });
          }
        }
      }
    }

    // Get settlements between these two users
    const settlements = await Settlement.find({
      $or: [
        { fromUserId: userId, toUserId: friendId },
        { fromUserId: friendId, toUserId: userId }
      ]
    })
      .populate("fromUserId", "name profilePicture")
      .populate("toUserId", "name profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    settlements.forEach((settlement: any) => {
      const isFromUser = settlement.fromUserId._id.toString() === session.user.id;
      const otherUser = isFromUser ? settlement.toUserId : settlement.fromUserId;
      const action = isFromUser ? "paid" : "received payment from";

      transactions.push({
        id: settlement._id,
        type: "settlement",
        description: `You ${action} ${otherUser.name}`,
        amount: settlement.amount,
        currency: settlement.currency,
        createdAt: settlement.createdAt,
        isSettlement: true,
        settled: true,
        user: {
          id: otherUser._id,
          name: otherUser.name,
          profilePicture: otherUser.profilePicture
        }
      });
    });

    // Sort all transactions by createdAt (most recent first)
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      transactions,
      count: transactions.length
    });
  } catch (error: any) {
    console.error("Get friend transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
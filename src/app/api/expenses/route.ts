import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import {splitEqually, splitByExactAmounts, splitByPercentages, splitByShares, validateSplit } from "@/lib/splitCalculator";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

// GET /api/expenses - List expenses
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const category = searchParams.get("category");
    const groupId = searchParams.get("groupId");

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find expenses where user is a participant
    const participantRecords = await ExpenseParticipant.find({ userId }).select(
      "expenseId"
    );
    const expenseIds = participantRecords.map((p) => p.expenseId);

    // Build query
    const query: any = {
      _id: { $in: expenseIds },
      isDeleted: false,
    };

    if (category) query.category = category;
    if (groupId) query.groupId = new mongoose.Types.ObjectId(groupId);

    const skip = (page - 1) * limit;

    const expenses = await Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email profilePicture")
      .populate("groupId", "name image")
      .lean();

    const total = await Expense.countDocuments(query);

    // Get participants for each expense
    const expensesWithParticipants = await Promise.all(
      expenses.map(async (expense) => {
        const participants = await ExpenseParticipant.find({
          expenseId: expense._id,
        }).populate("userId", "name email profilePicture");

        return {
          ...expense,
          participants,
        };
      })
    );

    return NextResponse.json(
      {
        expenses: expensesWithParticipants,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get expenses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

// POST /api/expenses - Create expense
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      amount,
      description,
      category,
      date,
      currency,
      groupId,
      images,
      notes,
      splitMethod,
      paidBy,
      participants,
    } = body;

    // Validation
    if (!amount || !description || !paidBy || !participants || participants.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Calculate split based on method
    let splitParticipants;

    switch (splitMethod) {
      case "equally":
        splitParticipants = splitEqually({
          amount,
          participants: participants.map((p: any) => p.userId || p),
          paidBy,
        });
        break;

      case "exact":
        splitParticipants = splitByExactAmounts({
          amount,
          participants,
          paidBy,
        });
        break;

      case "percentage":
        splitParticipants = splitByPercentages({
          amount,
          participants,
          paidBy,
        });
        break;

      case "shares":
        splitParticipants = splitByShares({
          amount,
          participants,
          paidBy,
        });
        break;

      default:
        return NextResponse.json(
          { error: "Invalid split method" },
          { status: 400 }
        );
    }

    // Validate split
    if (!validateSplit(splitParticipants, amount)) {
      return NextResponse.json(
        { error: "Invalid split calculation" },
        { status: 400 }
      );
    }

    // Create expense
    const expense = await Expense.create({
      amount,
      description,
      category: category || "other",
      date: date || new Date(),
      currency: currency || "INR",
      createdBy: userId,
      groupId: groupId || null,
      images: images || [],
      notes: notes || "",
    });

    // Create expense participants
    await ExpenseParticipant.insertMany(
      splitParticipants.map((p) => ({
        expenseId: expense._id,
        userId: p.userId,
        paidAmount: p.paidAmount,
        owedAmount: p.owedAmount,
        isSettled: false,
      }))
    );

    const populatedExpense = await Expense.findById(expense._id)
      .populate("createdBy", "name email profilePicture")
      .populate("groupId", "name image");

    const expenseParticipants = await ExpenseParticipant.find({
      expenseId: expense._id,
    }).populate("userId", "name email profilePicture");

    return NextResponse.json(
      {
        message: "Expense created successfully",
        expense: {
          ...populatedExpense!.toJSON(),
          participants: expenseParticipants,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

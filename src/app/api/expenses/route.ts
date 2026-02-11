import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import {splitEqually, splitByExactAmounts, splitByPercentages, splitByShares, validateSplit } from "@/lib/splitCalculator";
import { authOptions } from "@/lib/auth";
import { notifyExpenseCreated } from "@/lib/notificationService";
import mongoose from "mongoose";
import Group from "@/models/Group";
import User from "@/models/User";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import {
  mirrorUpsertToSupabase,
  readWithMode,
} from "@/lib/data";
import { mongoReadRepository, supabaseReadRepository } from "@/lib/data/read-routing";

export const dynamic = 'force-dynamic';

// GET /api/expenses - List expenses
export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const category = searchParams.get("category");
    const groupId = searchParams.get("groupId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const cacheKey = buildUserScopedCacheKey(
      "expenses",
      session.user.id,
      request.nextUrl.search
    );

    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.expenses,
      async () =>
        readWithMode({
          routeName: "/api/expenses",
          userId: session.user.id,
          requestKey: request.nextUrl.search,
          mongoRead: () =>
            mongoReadRepository.getExpenses({
              userId: session.user.id,
              page,
              limit,
              category,
              groupId,
              startDate,
              endDate,
            }),
          supabaseRead: () =>
            supabaseReadRepository.getExpenses({
              userId: session.user.id,
              page,
              limit,
              category,
              groupId,
              startDate,
              endDate,
            }),
        })
    );

    return NextResponse.json(
      payload,
      {
        status: 200,
        headers: {
          "X-Doosplit-Cache": cacheStatus,
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
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

    // Validate images array
    if (images && Array.isArray(images)) {
      if (images.length > 10) {
        return NextResponse.json(
          { error: "Maximum 10 images allowed per expense" },
          { status: 400 }
        );
      }

      // Validate that all image references are strings (reference IDs)
      const invalidImages = images.filter(img => typeof img !== 'string' || !img.trim());
      if (invalidImages.length > 0) {
        return NextResponse.json(
          { error: "All image references must be valid strings" },
          { status: 400 }
        );
      }
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
        // Transform participants to the format expected by splitByExactAmounts
        const exactParticipants = participants.map((p: any) => ({
          userId: p.userId,
          owedAmount: p.exactAmount || 0,
        }));
        splitParticipants = splitByExactAmounts({
          amount,
          participants: exactParticipants,
          paidBy,
        });
        break;

      case "percentage":
        // Transform participants to the format expected by splitByPercentages
        const percentageParticipants = participants.map((p: any) => ({
          userId: p.userId,
          percentage: p.percentage || 0,
        }));
        splitParticipants = splitByPercentages({
          amount,
          participants: percentageParticipants,
          paidBy,
        });
        break;

      case "shares":
        // Transform participants to the format expected by splitByShares
        const sharesParticipants = participants.map((p: any) => ({
          userId: p.userId,
          shares: p.shares || 1,
        }));
        splitParticipants = splitByShares({
          amount,
          participants: sharesParticipants,
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

    await mirrorUpsertToSupabase("expenses", expense._id.toString(), {
      id: expense._id.toString(),
      amount: Number(expense.amount || amount),
      description: expense.description,
      category: expense.category || "other",
      date: expense.date || date || new Date(),
      currency: expense.currency || "INR",
      created_by: userId.toString(),
      group_id: groupId || null,
      images: images || [],
      notes: notes || null,
      is_deleted: false,
      edit_history: [],
      created_at: expense.createdAt,
      updated_at: expense.updatedAt,
    });

    for (const participant of expenseParticipants as any[]) {
      await mirrorUpsertToSupabase(
        "expense_participants",
        participant._id.toString(),
        {
          id: participant._id.toString(),
          expense_id: expense._id.toString(),
          user_id: participant.userId._id.toString(),
          paid_amount: Number(participant.paidAmount || 0),
          owed_amount: Number(participant.owedAmount || 0),
          is_settled: !!participant.isSettled,
          created_at: participant.createdAt,
          updated_at: participant.updatedAt,
        }
      );
    }

    // Get creator's name and group name for notification
    const creator = await User.findById(userId).select("name");
    let groupName: string | undefined;
    if (groupId) {
      const group = await Group.findById(groupId).select("name");
      groupName = group?.name;
    }

    // Create notifications for all participants except the creator
    try {
      await notifyExpenseCreated(
        expense._id,
        description,
        amount,
        currency || "INR",
        { id: userId, name: creator?.name || "Someone" },
        splitParticipants.map((p) => p.userId),
        groupName
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
      // Don't fail the expense creation if notifications fail
    }

    // Create ETag for optimistic concurrency
    const versionVector = {
      version: 1,
      lastModified: expense.updatedAt,
      modifiedBy: expense.createdBy,
    };
    const etag = `\"${expense._id}-1\"`;

    const affectedUserIds = Array.from(
      new Set(
        [session.user.id, ...splitParticipants.map((p: any) => p.userId?.toString())].filter(
          Boolean
        )
      )
    ) as string[];

    await invalidateUsersCache(affectedUserIds, [
      "expenses",
      "friends",
      "groups",
      "activities",
      "dashboard-activity",
      "friend-transactions",
      "friend-details",
      "user-balance",
      "analytics",
    ]);

    return NextResponse.json(
      {
        message: "Expense created successfully",
        expense: {
          ...populatedExpense!.toJSON(),
          participants: expenseParticipants,
          _version: versionVector,
        },
      },
      {
        status: 201,
        headers: {
          'ETag': etag,
          'X-Version-Vector': JSON.stringify(versionVector),
        }
      }
    );
  } catch (error: any) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

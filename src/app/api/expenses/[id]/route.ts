import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import {
  splitEqually,
  splitByExactAmounts,
  splitByPercentages,
  splitByShares,
  validateSplit,
} from "@/lib/splitCalculator";
import { authOptions } from "@/lib/auth";
import { notifyExpenseUpdated, notifyExpenseDeleted } from "@/lib/notificationService";
import mongoose from "mongoose";
import User from "@/models/User";

// GET /api/expenses/[id] - Get single expense
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const expense = await Expense.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("createdBy", "name email profilePicture")
      .populate("groupId", "name image");

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Check if user is a participant
    const userId = new mongoose.Types.ObjectId(session.user.id);
    const isParticipant = await ExpenseParticipant.findOne({
      expenseId: expense._id,
      userId,
    });

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const participants = await ExpenseParticipant.find({
      expenseId: expense._id,
    }).populate("userId", "name email profilePicture");

    // Add version vector and ETag
    const versionVector = {
      version: expense.version || 1,
      lastModified: expense.lastModified || expense.updatedAt,
      modifiedBy: expense.modifiedBy || expense.createdBy,
    };
    const etag = `"${expense._id}-${expense.version || 1}"`;

    return NextResponse.json(
      {
        expense: {
          ...expense.toJSON(),
          participants,
          _version: versionVector,
        },
      },
      {
        status: 200,
        headers: {
          'ETag': etag,
          'X-Version-Vector': JSON.stringify(versionVector),
        }
      }
    );
  } catch (error: any) {
    console.error("Get expense error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
}

// PUT /api/expenses/[id] - Update expense
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    await dbConnect();

    const expense = await Expense.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is a participant (only creator can edit)
    const isParticipant = await ExpenseParticipant.findOne({
      expenseId: expense._id,
      userId: userId,
    });

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optimistic concurrency control
    const ifMatch = request.headers.get('If-Match');
    if (ifMatch) {
      const expectedEtag = `"${expense._id}-${expense.version || 1}"`;
      if (ifMatch !== expectedEtag) {
        return NextResponse.json(
          {
            error: "Conflict detected",
            message: "This expense has been modified by another user. Please refresh and try again.",
            currentVersion: expense.version || 1
          },
          { status: 409 }
        );
      }
    }

    // Validate images array
    if (images !== undefined && Array.isArray(images)) {
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

    const expense = await Expense.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Only creator can edit
    if (expense.createdBy.toString() !== userId.toString()) {
      return NextResponse.json(
        { error: "Only expense creator can edit" },
        { status: 403 }
      );
    }

    // Store old values for edit history
    const changes = [];
    if (amount !== undefined && amount !== expense.amount) changes.push(`amount: ${expense.amount} → ${amount}`);
    if (description !== undefined && description !== expense.description) changes.push(`description: "${expense.description}" → "${description}"`);
    if (category !== undefined && category !== expense.category) changes.push(`category: ${expense.category} → ${category}`);
    if (date !== undefined) changes.push(`date updated`);

    const editEntry = {
      editedAt: new Date(),
      editedBy: userId,
      changes: changes.length > 0 ? changes.join(', ') : 'Updated',
    };

    // Update expense fields
    if (amount !== undefined) expense.amount = amount;
    if (description !== undefined) expense.description = description;
    if (category !== undefined) expense.category = category;
    if (date !== undefined) expense.date = date;
    if (currency !== undefined) expense.currency = currency;
    if (groupId !== undefined) expense.groupId = groupId;
    if (images !== undefined) expense.images = images;
    if (notes !== undefined) expense.notes = notes;

    // Update version tracking
    expense.version = (expense.version || 1) + 1;
    expense.lastModified = new Date();
    expense.modifiedBy = userId;

    // Add to edit history
    expense.editHistory.push(editEntry);

    await expense.save();

    // If split changed, recalculate participants
    if (splitMethod && participants) {
      let splitParticipants;

      switch (splitMethod) {
        case "equally":
          splitParticipants = splitEqually({
            amount: expense.amount,
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
            amount: expense.amount,
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
            amount: expense.amount,
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
            amount: expense.amount,
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

      if (!validateSplit(splitParticipants, expense.amount)) {
        return NextResponse.json(
          { error: "Invalid split calculation" },
          { status: 400 }
        );
      }

      // Delete old participants
      await ExpenseParticipant.deleteMany({ expenseId: expense._id });

      // Create new participants
      await ExpenseParticipant.insertMany(
        splitParticipants.map((p) => ({
          expenseId: expense._id,
          userId: p.userId,
          paidAmount: p.paidAmount,
          owedAmount: p.owedAmount,
          isSettled: false,
        }))
      );
    }

    const updatedExpense = await Expense.findById(expense._id)
      .populate("createdBy", "name email profilePicture")
      .populate("groupId", "name image");

    const expenseParticipants = await ExpenseParticipant.find({
      expenseId: expense._id,
    }).populate("userId", "name email profilePicture");

    // Send notifications to participants
    try {
      const updater = await User.findById(userId).select("name");
      await notifyExpenseUpdated(
        expense._id,
        expense.description,
        { id: userId, name: updater?.name || "Someone" },
        expenseParticipants.map((p: any) => p.userId._id)
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    // Create version vector and ETag
    const versionVector = {
      version: expense.version,
      lastModified: expense.lastModified,
      modifiedBy: expense.modifiedBy,
    };
    const etag = `"${expense._id}-${expense.version}"`;

    return NextResponse.json(
      {
        message: "Expense updated successfully",
        expense: {
          ...updatedExpense!.toJSON(),
          participants: expenseParticipants,
          _version: versionVector,
        },
      },
      {
        status: 200,
        headers: {
          'ETag': etag,
          'X-Version-Vector': JSON.stringify(versionVector),
        }
      }
    );
  } catch (error: any) {
    console.error("Update expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update expense" },
      { status: 500 }
    );
  }
}

// DELETE /api/expenses/[id] - Soft delete expense
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const expense = await Expense.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Only creator can delete
    if (expense.createdBy.toString() !== userId.toString()) {
      return NextResponse.json(
        { error: "Only expense creator can delete" },
        { status: 403 }
      );
    }

    // Get participants before deleting
    const participants = await ExpenseParticipant.find({
      expenseId: expense._id,
    }).select("userId");

    // Soft delete
    expense.isDeleted = true;
    await expense.save();

    // Send notifications
    try {
      const deleter = await User.findById(userId).select("name");
      await notifyExpenseDeleted(
        expense.description,
        { id: userId, name: deleter?.name || "Someone" },
        participants.map((p: any) => p.userId)
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    return NextResponse.json(
      { message: "Expense deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Delete expense error:", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}

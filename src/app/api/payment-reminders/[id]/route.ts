import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import PaymentReminder from "@/models/PaymentReminder";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

// PUT /api/payment-reminders/[id] - Update payment reminder status
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
    const { action } = body; // "mark_read", "mark_paid"

    if (!action || !["mark_read", "mark_paid"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'mark_read' or 'mark_paid'" },
        { status: 400 }
      );
    }

    await dbConnect();
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Find the reminder and ensure user has permission to update it
    const reminder = await PaymentReminder.findById(id);
    if (!reminder) {
      return NextResponse.json(
        { error: "Payment reminder not found" },
        { status: 404 }
      );
    }

    // Only the recipient can mark as read, and both sender and recipient can mark as paid
    if (action === "mark_read") {
      if (reminder.toUserId.toString() !== userId.toString()) {
        return NextResponse.json(
          { error: "Only the recipient can mark reminders as read" },
          { status: 403 }
        );
      }
      reminder.status = "read";
      reminder.readAt = new Date();
    } else if (action === "mark_paid") {
      // Allow both sender and recipient to mark as paid
      if (reminder.fromUserId.toString() !== userId.toString() &&
          reminder.toUserId.toString() !== userId.toString()) {
        return NextResponse.json(
          { error: "Only sender or recipient can mark reminders as paid" },
          { status: 403 }
        );
      }
      reminder.status = "paid";
      reminder.paidAt = new Date();
    }

    await reminder.save();

    return NextResponse.json({
      reminder: {
        id: reminder._id,
        status: reminder.status,
        readAt: reminder.readAt,
        paidAt: reminder.paidAt,
        updatedAt: reminder.updatedAt,
      },
      message: `Payment reminder ${action === "mark_read" ? "marked as read" : "marked as paid"}`
    });
  } catch (error: any) {
    console.error("Update payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to update payment reminder" },
      { status: 500 }
    );
  }
}
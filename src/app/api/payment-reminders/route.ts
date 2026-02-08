import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import PaymentReminder from "@/models/PaymentReminder";
import { authOptions } from "@/lib/auth";
import { sendPaymentReminder } from "@/lib/email";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

// GET /api/payment-reminders - Get payment reminders for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "received"; // "received" or "sent"

    await dbConnect();
    const userId = new mongoose.Types.ObjectId(session.user.id);

    let query;
    if (type === "sent") {
      query = { fromUserId: userId };
    } else {
      query = { toUserId: userId };
    }

    const reminders = await PaymentReminder.find(query)
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .sort({ createdAt: -1 });

    const formattedReminders = reminders.map(reminder => ({
      id: reminder._id,
      fromUser: {
        id: (reminder.fromUserId as any)._id,
        name: (reminder.fromUserId as any).name,
        email: (reminder.fromUserId as any).email,
        profilePicture: (reminder.fromUserId as any).profilePicture,
      },
      toUser: {
        id: (reminder.toUserId as any)._id,
        name: (reminder.toUserId as any).name,
        email: (reminder.toUserId as any).email,
        profilePicture: (reminder.toUserId as any).profilePicture,
      },
      amount: reminder.amount,
      currency: reminder.currency,
      message: reminder.message,
      status: reminder.status,
      sentAt: reminder.sentAt,
      readAt: reminder.readAt,
      paidAt: reminder.paidAt,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
    }));

    return NextResponse.json({
      reminders: formattedReminders,
      type
    });
  } catch (error: any) {
    console.error("Get payment reminders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment reminders" },
      { status: 500 }
    );
  }
}

// POST /api/payment-reminders - Create a new payment reminder
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { toUserId, amount, currency, message } = body;

    if (!toUserId || !amount) {
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
    const fromUserId = new mongoose.Types.ObjectId(session.user.id);
    const toUserObjectId = new mongoose.Types.ObjectId(toUserId);

    // Prevent sending reminders to yourself
    if (fromUserId.toString() === toUserObjectId.toString()) {
      return NextResponse.json(
        { error: "Cannot send payment reminder to yourself" },
        { status: 400 }
      );
    }

    // Create the payment reminder
    const reminder = await PaymentReminder.create({
      fromUserId,
      toUserId: toUserObjectId,
      amount,
      currency: currency || "INR",
      message: message?.trim(),
      status: "sent",
      sentAt: new Date(),
    });

    // Populate the reminder for response
    await reminder.populate("fromUserId", "name email profilePicture");
    await reminder.populate("toUserId", "name email profilePicture");

    // Send email notification (optional, can be disabled via settings)
    try {
      await sendPaymentReminder({
        to: (reminder.toUserId as any).email,
        fromUserName: (reminder.fromUserId as any).name,
        toUserName: (reminder.toUserId as any).name,
        amount: reminder.amount,
        currency: reminder.currency,
        message: reminder.message,
      });
    } catch (emailError) {
      console.error("Failed to send payment reminder email:", emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      reminder: {
        id: reminder._id,
        fromUser: {
          id: (reminder.fromUserId as any)._id,
          name: (reminder.fromUserId as any).name,
          email: (reminder.fromUserId as any).email,
          profilePicture: (reminder.fromUserId as any).profilePicture,
        },
        toUser: {
          id: (reminder.toUserId as any)._id,
          name: (reminder.toUserId as any).name,
          email: (reminder.toUserId as any).email,
          profilePicture: (reminder.toUserId as any).profilePicture,
        },
        amount: reminder.amount,
        currency: reminder.currency,
        message: reminder.message,
        status: reminder.status,
        sentAt: reminder.sentAt,
        createdAt: reminder.createdAt,
      },
      message: "Payment reminder sent successfully"
    });
  } catch (error: any) {
    console.error("Create payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to create payment reminder" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Settlement from "@/models/Settlement";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import { authOptions } from "@/lib/auth";
import { notifySettlement } from "@/lib/notificationService";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

// GET /api/settlements - List settlements
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const groupId = searchParams.get("groupId");
    const friendId = searchParams.get("friendId");

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Build query - find settlements where user is sender or receiver
    const query: any = {
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    };

    if (groupId) query.groupId = new mongoose.Types.ObjectId(groupId);
    if (friendId) {
      const friendObjectId = new mongoose.Types.ObjectId(friendId);
      query.$or = [
        { fromUserId: userId, toUserId: friendObjectId },
        { fromUserId: friendObjectId, toUserId: userId },
      ];
    }

    const skip = (page - 1) * limit;

    const settlements = await Settlement.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .populate("groupId", "name image")
      .lean();

    const total = await Settlement.countDocuments(query);

    return NextResponse.json(
      {
        settlements,
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
    console.error("Get settlements error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlements" },
      { status: 500 }
    );
  }
}

// POST /api/settlements - Create settlement
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      fromUserId,
      toUserId,
      amount,
      currency,
      method,
      note,
      screenshot,
      date,
      groupId,
    } = body;

    // Validation
    if (!fromUserId || !toUserId || !amount) {
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

    if (fromUserId === toUserId) {
      return NextResponse.json(
        { error: "Cannot settle with yourself" },
        { status: 400 }
      );
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // User must be either sender or receiver
    if (
      fromUserId !== userId.toString() &&
      toUserId !== userId.toString()
    ) {
      return NextResponse.json(
        { error: "You must be part of the settlement" },
        { status: 403 }
      );
    }

    // Create settlement
    const settlement = await Settlement.create({
      fromUserId: new mongoose.Types.ObjectId(fromUserId),
      toUserId: new mongoose.Types.ObjectId(toUserId),
      amount,
      currency: currency || "INR",
      method: method || "Cash",
      note: note || "",
      screenshot: screenshot || null,
      date: date || new Date(),
      groupId: groupId ? new mongoose.Types.ObjectId(groupId) : undefined,
    });

    const populatedSettlement = await Settlement.findById(settlement._id)
      .populate("fromUserId", "name email profilePicture")
      .populate("toUserId", "name email profilePicture")
      .populate("groupId", "name image");

    // Send notification to the other party
    try {
      await notifySettlement(
        settlement._id,
        {
          id: populatedSettlement!.fromUserId._id,
          name: (populatedSettlement!.fromUserId as any).name,
        },
        {
          id: populatedSettlement!.toUserId._id,
          name: (populatedSettlement!.toUserId as any).name,
        },
        amount,
        currency || "INR",
        userId
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    return NextResponse.json(
      {
        message: "Settlement recorded successfully",
        settlement: populatedSettlement,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create settlement error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create settlement" },
      { status: 500 }
    );
  }
}


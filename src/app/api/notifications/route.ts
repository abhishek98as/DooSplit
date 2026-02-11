import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Notification from "@/models/Notification";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";
import { mirrorUpsertToSupabase } from "@/lib/data";

export const dynamic = 'force-dynamic';

// GET /api/notifications - Get user notifications
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    const query: any = { userId };
    if (unreadOnly) {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    return NextResponse.json(
      {
        notifications,
        unreadCount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// PUT /api/notifications - Mark all as read
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    const updated = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    for (const item of updated as any[]) {
      await mirrorUpsertToSupabase("notifications", item._id.toString(), {
        id: item._id.toString(),
        user_id: item.userId.toString(),
        type: item.type,
        message: item.message,
        data: item.data || {},
        is_read: true,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    }

    return NextResponse.json(
      { message: "All notifications marked as read" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Mark notifications read error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}


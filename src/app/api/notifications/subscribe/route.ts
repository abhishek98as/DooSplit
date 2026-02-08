import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

// POST /api/notifications/subscribe - Subscribe to push notifications
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Update user with push subscription
    await User.findByIdAndUpdate(session.user.id, {
      pushSubscription: subscription,
      pushNotificationsEnabled: true,
    });

    return NextResponse.json({
      message: "Successfully subscribed to push notifications"
    });
  } catch (error: any) {
    console.error("Subscribe to notifications error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe to notifications" },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/subscribe - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    // Remove push subscription from user
    await User.findByIdAndUpdate(session.user.id, {
      $unset: { pushSubscription: 1 },
      pushNotificationsEnabled: false,
    });

    return NextResponse.json({
      message: "Successfully unsubscribed from push notifications"
    });
  } catch (error: any) {
    console.error("Unsubscribe from notifications error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe from notifications" },
      { status: 500 }
    );
  }
}
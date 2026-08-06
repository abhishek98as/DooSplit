import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  queryNotificationsForUser,
  countUnreadNotifications,
  deleteAllNotificationsForUser,
} from "@/lib/dynamodb/entities/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const [result, unreadCount] = await Promise.all([
      queryNotificationsForUser(auth.user.id, 50),
      countUnreadNotifications(auth.user.id),
    ]);

    const notifications = result.items.map((n: any) => ({
      _id: n.id, userId: n.user_id, type: n.type, title: n.title,
      message: n.message || n.body || "", relatedId: n.related_id || n.data?.noteId || n.data?.groupId || n.data?.expenseId,
      data: n.data || {},
      isRead: n.is_read ?? false,
      createdAt: n.created_at,
    }));

    return NextResponse.json(
      { notifications, unreadCount },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/** Clear all notifications (seen / dismiss all). */
export async function PUT(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const deleted = await deleteAllNotificationsForUser(auth.user.id);
    return NextResponse.json(
      { message: "All notifications cleared", deleted },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Clear notifications error:", error);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const deleted = await deleteAllNotificationsForUser(auth.user.id);
    return NextResponse.json(
      { message: "All notifications cleared", deleted },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Clear notifications error:", error);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}

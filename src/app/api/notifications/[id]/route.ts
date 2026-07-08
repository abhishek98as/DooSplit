import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { queryNotificationsForUser, markNotificationRead, deleteNotification } from "@/lib/dynamodb/entities/notifications";

export const dynamic = "force-dynamic";

async function findNotification(userId: string, id: string) {
  const { items } = await queryNotificationsForUser(userId, 200);
  return items.find((n: any) => n.id === id) ?? null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const notif = await findNotification(auth.user.id, id);
    if (!notif) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    await markNotificationRead(auth.user.id, notif.created_at, id);
    return NextResponse.json(
      { message: "Notification marked as read", notification: { ...notif, is_read: true } },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Mark notification read error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const notif = await findNotification(auth.user.id, id);
    if (!notif) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    await deleteNotification(auth.user.id, notif.created_at, id);
    return NextResponse.json(
      { message: "Notification deleted" },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}

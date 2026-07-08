import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { mapNotification } from "@/lib/firestore/route-helpers";
import { getDataBackendMode } from "@/lib/data/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
    const backend = getDataBackendMode();

    if (backend === "dynamodb") {
      const { queryNotificationsForUser, countUnreadNotifications } = await import("@/lib/dynamodb/entities/notifications");
      const [result, unreadCount] = await Promise.all([
        queryNotificationsForUser(auth.user.id, 50),
        countUnreadNotifications(auth.user.id),
      ]);

      const notifications = result.items.map((n: any) => ({
        _id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.related_id,
        isRead: n.is_read ?? false,
        createdAt: n.created_at,
      }));

      return NextResponse.json(
        { notifications, unreadCount },
        { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
      );
    }

    // Firestore path
    const db = getAdminDb();

    let listQuery = db
      .collection("notifications")
      .where("user_id", "==", auth.user.id);
    if (unreadOnly) {
      listQuery = listQuery.where("is_read", "==", false);
    }

    const [listSnap, unreadSnap] = await Promise.all([
      listQuery.orderBy("created_at", "desc").limit(50).get(),
      db
        .collection("notifications")
        .where("user_id", "==", auth.user.id)
        .where("is_read", "==", false)
        .get(),
    ]);

    const notifications = listSnap.docs.map((doc) =>
      mapNotification({ id: doc.id, ...((doc.data() as any) || {}) })
    );
    const unreadCount = unreadSnap.size;

    return NextResponse.json(
      { notifications, unreadCount },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const backend = getDataBackendMode();

    if (backend === "dynamodb") {
      const { markAllNotificationsRead } = await import("@/lib/dynamodb/entities/notifications");
      await markAllNotificationsRead(auth.user.id);
      return NextResponse.json(
        { message: "All notifications marked as read" },
        { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
      );
    }

    // Firestore path
    const db = getAdminDb();
    const unreadSnap = await db
      .collection("notifications")
      .where("user_id", "==", auth.user.id)
      .where("is_read", "==", false)
      .limit(400)
      .get();

    if (!unreadSnap.empty) {
      const nowIso = new Date().toISOString();
      const batch = db.batch();
      for (const doc of unreadSnap.docs) {
        batch.set(
          doc.ref,
          { is_read: true, updated_at: nowIso, _updated_at: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      await batch.commit();
    }

    return NextResponse.json(
      { message: "All notifications marked as read" },
      { status: 200, headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) } }
    );
  } catch (error: any) {
    console.error("Mark notifications read error:", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

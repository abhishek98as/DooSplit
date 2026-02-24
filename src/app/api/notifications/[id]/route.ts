import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { mapNotification } from "@/lib/firestore/route-helpers";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const db = getAdminDb();
    const ref = db.collection("notifications").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }
    const row = snap.data() || {};
    if (String(row.user_id || "") !== auth.user.id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    await ref.set(
      {
        is_read: true,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const updatedSnap = await ref.get();
    const updated = { id: updatedSnap.id, ...(updatedSnap.data() || {}) };

    return NextResponse.json(
      {
        message: "Notification marked as read",
        notification: mapNotification(updated),
      },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Mark notification read error:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const db = getAdminDb();
    const ref = db.collection("notifications").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }
    const row = snap.data() || {};
    if (String(row.user_id || "") !== auth.user.id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await ref.delete();

    return NextResponse.json(
      { message: "Notification deleted" },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Delete notification error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 }
    );
  }
}

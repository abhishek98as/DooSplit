import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { toIso } from "@/lib/firestore/route-helpers";

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

    const body = await request.json();
    const action = String(body?.action || "");
    if (!["mark_read", "mark_paid"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'mark_read' or 'mark_paid'" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const ref = db.collection("payment_reminders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Payment reminder not found" },
        { status: 404 }
      );
    }
    const reminder: any = { id: snap.id, ...((snap.data() as any) || {}) };

    if (action === "mark_read") {
      if (String(reminder.to_user_id || "") !== auth.user.id) {
        return NextResponse.json(
          { error: "Only the recipient can mark reminders as read" },
          { status: 403 }
        );
      }
    } else if (
      String(reminder.from_user_id || "") !== auth.user.id &&
      String(reminder.to_user_id || "") !== auth.user.id
    ) {
      return NextResponse.json(
        { error: "Only sender or recipient can mark reminders as paid" },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const patch =
      action === "mark_read"
        ? { status: "read", read_at: nowIso }
        : { status: "paid", paid_at: nowIso };

    await ref.set(
      {
        ...patch,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const updatedSnap = await ref.get();
    const updated: any = { id: updatedSnap.id, ...((updatedSnap.data() as any) || {}) };

    return NextResponse.json(
      {
        reminder: {
          id: updated.id,
          status: updated.status,
          readAt: toIso(updated.read_at),
          paidAt: toIso(updated.paid_at),
          updatedAt: toIso(updated.updated_at || updated._updated_at),
        },
        message: `Payment reminder ${action === "mark_read" ? "marked as read" : "marked as paid"}`,
      },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Update payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to update payment reminder" },
      { status: 500 }
    );
  }
}

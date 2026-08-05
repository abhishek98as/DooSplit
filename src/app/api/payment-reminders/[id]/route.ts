import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
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

    const { getReminderById, updateReminderStatus } = await import(
      "@/lib/dynamodb/entities/reminders"
    );
    const reminder = await getReminderById(id);
    if (!reminder) {
      return NextResponse.json({ error: "Payment reminder not found" }, { status: 404 });
    }

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
    if (action === "mark_read") {
      await updateReminderStatus(id, "read", nowIso, undefined, { read_at: nowIso });
    } else {
      await updateReminderStatus(id, "paid", nowIso, undefined, { paid_at: nowIso });
    }

    const updated = await getReminderById(id);
    if (!updated) {
      return NextResponse.json({ error: "Failed to load updated reminder" }, { status: 500 });
    }

    return NextResponse.json(
      {
        reminder: {
          id: updated.id,
          status: updated.status,
          readAt: toIso(updated.read_at),
          paidAt: toIso(updated.paid_at),
          updatedAt: toIso(updated.updated_at),
        },
        message: `Payment reminder ${action === "mark_read" ? "marked as read" : "marked as paid"}`,
      },
      {
        status: 200,
        headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) },
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

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const supabase = requireSupabaseAdmin();
    const { data: reminder, error } = await supabase
      .from("payment_reminders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!reminder) {
      return NextResponse.json(
        { error: "Payment reminder not found" },
        { status: 404 }
      );
    }

    if (action === "mark_read") {
      if (String(reminder.to_user_id) !== auth.user.id) {
        return NextResponse.json(
          { error: "Only the recipient can mark reminders as read" },
          { status: 403 }
        );
      }
    } else if (
      String(reminder.from_user_id) !== auth.user.id &&
      String(reminder.to_user_id) !== auth.user.id
    ) {
      return NextResponse.json(
        { error: "Only sender or recipient can mark reminders as paid" },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> =
      action === "mark_read"
        ? { status: "read", read_at: nowIso }
        : { status: "paid", paid_at: nowIso };

    const { data: updated, error: updateError } = await supabase
      .from("payment_reminders")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }
    if (!updated) {
      return NextResponse.json(
        { error: "Payment reminder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      reminder: {
        id: updated.id,
        status: updated.status,
        readAt: updated.read_at,
        paidAt: updated.paid_at,
        updatedAt: updated.updated_at,
      },
      message: `Payment reminder ${action === "mark_read" ? "marked as read" : "marked as paid"}`,
    });
  } catch (error: any) {
    console.error("Update payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to update payment reminder" },
      { status: 500 }
    );
  }
}


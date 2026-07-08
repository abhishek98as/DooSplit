import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { updateNudgeState } from "@/lib/nudges/service";
import { invalidateUsersCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (!["dismiss", "snooze", "mark_acted"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be dismiss, snooze, or mark_acted" },
        { status: 400 }
      );
    }

    const result = await updateNudgeState({
      userId: auth.user.id,
      nudgeId: id,
      action: action as "dismiss" | "snooze" | "mark_acted",
      snoozeUntil: body?.snoozeUntil ? String(body.snoozeUntil) : null,
    });

    await invalidateUsersCache([auth.user.id], ["nudges", "activities", "dashboard-activity"]);

    return NextResponse.json({ nudge: result }, { status: 200 });
  } catch (error) {
    console.error("Update nudge error:", error);
    return NextResponse.json({ error: "Failed to update nudge" }, { status: 500 });
  }
}

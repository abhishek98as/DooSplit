/**
 * Vercel Cron Job: Send Due Payment Reminders
 * Uses GSI3 REMSTATUS#sent — no full-table Scan.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendPushNotificationToUsers } from "@/lib/firebase-messaging-admin";
import {
  listRemindersByStatus,
  updateReminderStatus,
} from "@/lib/dynamodb/entities/reminders";
import { getUserById } from "@/lib/dynamodb/entities/users";

export const dynamic = "force-dynamic";

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const allSent = await listRemindersByStatus("sent");
    const pendingReminders = allSent.filter((item) => {
      if (!item.last_push_at) return true;
      const pushTime = new Date(item.last_push_at).getTime();
      return pushTime < sixHoursAgo.getTime();
    });

    if (pendingReminders.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No pending reminders",
      });
    }

    const remindersByUser = new Map<string, typeof pendingReminders>();
    for (const reminder of pendingReminders) {
      const toUserId = String(reminder.to_user_id);
      const list = remindersByUser.get(toUserId) || [];
      list.push(reminder);
      remindersByUser.set(toUserId, list);
    }

    let sent = 0;
    const updatedIds: string[] = [];

    for (const [toUserId, reminders] of remindersByUser) {
      const recipient = await getUserById(toUserId);
      if (!recipient || !(recipient as any).push_notifications_enabled) continue;

      const totalAmount = reminders.reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0
      );
      const fromNames = [...new Set(reminders.map((r) => r.from_user_id))];

      try {
        await sendPushNotificationToUsers([toUserId], {
          title: "Payment Reminder",
          body: `You have ${reminders.length} pending payment reminder${reminders.length > 1 ? "s" : ""} totaling ₹${totalAmount.toFixed(0)}`,
          data: {
            type: "payment_reminder",
            fromUserIds: JSON.stringify(fromNames),
          },
        });

        const nowIso = now.toISOString();
        for (const r of reminders) {
          await updateReminderStatus(r.id, "sent", nowIso, nowIso);
          updatedIds.push(r.id);
        }
        sent += reminders.length;
      } catch (err) {
        console.error(
          `[cron:payment-reminders] Failed to send push to ${toUserId}:`,
          err
        );
      }
    }

    return NextResponse.json({
      ok: true,
      processed: sent,
      total: pendingReminders.length,
      updatedIds,
    });
  } catch (error: any) {
    console.error("[cron:payment-reminders] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}

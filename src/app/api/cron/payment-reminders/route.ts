/**
 * Vercel Cron Job: Send Due Payment Reminders
 *
 * Runs every hour via Vercel Cron. Replaces Firebase Cloud Function
 * `sendDuePaymentReminders` (scheduler.onSchedule("every 60 minutes")).
 *
 * Queries MongoDB for old, unacknowledged payment reminders and sends
 * push notifications to the recipients.
 */
import { NextRequest, NextResponse } from "next/server";
import { PaymentReminder, User } from "@/lib/mongodb/models";
import { sendPushNotificationToUsers } from "@/lib/firebase-messaging-admin";

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
    // Find reminders older than 24 hours that haven't been acknowledged
    // and haven't been pushed recently (last 6 hours)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const pendingReminders = await PaymentReminder.find({
      status: "sent",
      $or: [
        { last_push_at: { $exists: false } },
        { last_push_at: null },
        { last_push_at: { $lt: sixHoursAgo } },
      ],
    }).lean();

    if (pendingReminders.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "No pending reminders" });
    }

    // Group reminders by recipient
    const remindersByUser = new Map<string, any[]>();
    for (const reminder of pendingReminders) {
      const toUserId = String(reminder.to_user_id);
      const list = remindersByUser.get(toUserId) || [];
      list.push(reminder);
      remindersByUser.set(toUserId, list);
    }

    let sent = 0;
    const updatedIds: string[] = [];

    for (const [toUserId, reminders] of remindersByUser) {
      const recipient = await User.findById(toUserId).lean();
      if (!recipient || !recipient.push_notifications_enabled) continue;

      const totalAmount = reminders.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const fromNames = [...new Set(reminders.map((r) => r.from_user_id))];

      try {
        await sendPushNotificationToUsers([toUserId], {
          title: "Payment Reminder",
          body: `You have ${reminders.length} pending payment reminder${reminders.length > 1 ? "s" : ""} totaling ₹${totalAmount.toFixed(0)}`,
          data: { type: "payment_reminder", fromUserIds: JSON.stringify(fromNames) },
        });

        // Update push timestamp
        await PaymentReminder.updateMany(
          { _id: { $in: reminders.map((r) => String(r._id)) } },
          { $set: { last_push_at: now } }
        );

        updatedIds.push(...reminders.map((r) => String(r._id)));
        sent += reminders.length;
      } catch (err) {
        console.error(`[cron:payment-reminders] Failed to send push to ${toUserId}:`, err);
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
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

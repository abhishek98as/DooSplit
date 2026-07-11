/**
 * Vercel Cron Job: Run Due Recurring Expenses
 *
 * Runs every hour via Vercel Cron.
 * Uses DynamoDB (listRecurringTemplatesDue) instead of Mongoose models.
 * Also sends FCM push to notify users about templates running tomorrow.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  listRecurringTemplatesDue,
  putRecurringRun,
  updateRecurringTemplate,
} from "@/lib/dynamodb/entities/recurring";
import { createExpenseFromPayload } from "@/lib/expenses/expense-creation";
import { newAppId } from "@/lib/ids";
import { sendPushNotificationToUsers } from "@/lib/firebase-messaging-admin";

export const dynamic = "force-dynamic";

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}

function advanceNextRunDate(
  currentRunDate: string,
  frequency: string,
  interval: number
): string {
  const date = new Date(currentRunDate);
  const intervalDays = Math.max(1, interval || 1);

  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + intervalDays);
      break;
    case "weekly":
      date.setDate(date.getDate() + intervalDays * 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + intervalDays);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayIso = now.toISOString().split("T")[0];

    // Compute tomorrow's date for reminder push notifications
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowIso = tomorrowDate.toISOString().split("T")[0];

    // ── 1. Send "tomorrow" push reminders ──────────────────────────────────
    try {
      const upcomingTemplates = await listRecurringTemplatesDue(tomorrowIso);
      for (const tmpl of upcomingTemplates) {
        try {
          await sendPushNotificationToUsers([tmpl.owner_id], {
            title: "⏰ Recurring Expense Tomorrow",
            body: `"${tmpl.description}" will be automatically created tomorrow.`,
            data: {
              type: "recurring_reminder",
              templateId: tmpl.id,
              actionHref: "/recurring-expenses",
            },
          });
        } catch (fcmErr) {
          console.error(`[cron:recurring] FCM reminder failed for template ${tmpl.id}:`, fcmErr);
        }
      }
    } catch (reminderErr) {
      console.error("[cron:recurring] Tomorrow reminder pass failed:", reminderErr);
    }

    // ── 2. Process today's due templates ──────────────────────────────────
    const dueTemplates = await listRecurringTemplatesDue(todayIso);

    if (dueTemplates.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "No due recurring expenses" });
    }

    const results: Array<{
      templateId: string;
      expenseId: string | null;
      error: string | null;
    }> = [];

    for (const template of dueTemplates) {
      try {
        const participantIds: string[] = Array.isArray(template.participant_ids)
          ? template.participant_ids
          : [];

        const expensePayload = {
          amount: template.amount,
          description: template.description,
          category: template.category,
          currency: template.currency || "INR",
          date: todayIso,
          splitMethod: template.split_type || "equally",
          paidBy: template.owner_id,
          participants: participantIds.map((uid) => ({ userId: uid })),
          notes: `Recurring: ${template.description}`,
        };

        const result = await createExpenseFromPayload({
          actor: {
            id: template.owner_id,
            name: "Recurring",
            email: "",
          },
          payload: expensePayload,
          metadata: {
            recurringTemplateId: template.id,
            recurrenceOccurrenceDate: todayIso,
          },
          activityType: "recurring",
          notify: true,
        });

        const expenseId = result.expenseId;
        const runId = newAppId();

        // Record the run
        await putRecurringRun({
          id: runId,
          template_id: template.id,
          owner_id: template.owner_id,
          run_date: todayIso,
          expense_id: expenseId,
          status: "success",
          created_at: now.toISOString(),
        });

        // Advance next run date
        const nextRunDate = advanceNextRunDate(
          todayIso,
          template.frequency,
          template.interval || 1
        );
        await updateRecurringTemplate(template.id, {
          next_run_date: nextRunDate,
          last_run_date: todayIso,
          run_count: (template.run_count || 0) + 1,
          updated_at: now.toISOString(),
        });

        results.push({ templateId: template.id, expenseId, error: null });
      } catch (err: any) {
        console.error(`[cron:recurring-expenses] Failed template ${template.id}:`, err);
        results.push({
          templateId: template.id,
          expenseId: null,
          error: err?.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      succeeded: results.filter((r) => r.expenseId).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (error: any) {
    console.error("[cron:recurring-expenses] Error:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

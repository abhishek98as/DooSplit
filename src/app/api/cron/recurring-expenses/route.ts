/**
 * Vercel Cron Job: Run Due Recurring Expenses
 *
 * Runs every hour via Vercel Cron. Replaces Firebase Cloud Function
 * `runDueRecurringExpenses` (scheduler.onSchedule("every 60 minutes")).
 *
 * Queries MongoDB for recurring expense templates whose `next_run_date`
 * is due, creates expense instances, and advances the schedule.
 */
import { NextRequest, NextResponse } from "next/server";
import { RecurringExpenseTemplate, RecurringExpenseRun } from "@/lib/mongodb/models";
import { buildSplitParticipants, validateExpensePayload } from "@/lib/expenses/expense-creation";
import { createExpenseInMongo } from "@/lib/mongodb/write-operations";
import { logActivity } from "@/lib/activity-logger";
import { newAppId } from "@/lib/ids";

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

  return date.toISOString();
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayIso = now.toISOString().split("T")[0];

    // Find active templates whose next_run_date is today or past
    const dueTemplates = await RecurringExpenseTemplate.find({
      is_active: true,
      next_run_date: {
        $exists: true,
        $ne: null,
        $lte: todayIso,
      },
    }).lean();

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
        const expensePayload = {
          amount: template.amount,
          description: template.description,
          category: template.category,
          currency: template.currency,
          date: todayIso,
          splitMethod: template.split_type,
          paidBy: template.owner_id,
          participants: template.participant_ids.map((uid) => ({ userId: uid })),
          notes: `Recurring: ${template.description}`,
        };

        const validationError = validateExpensePayload(expensePayload);
        if (validationError) {
          results.push({ templateId: String(template._id), expenseId: null, error: validationError });
          continue;
        }

        const participants = buildSplitParticipants(expensePayload, template.owner_id);
        const expenseData: Record<string, any> = {
          amount: template.amount,
          description: template.description,
          category: template.category,
          date: todayIso,
          currency: template.currency || "INR",
          created_by: template.owner_id,
          group_id: null,
          images: [],
          notes: `Recurring: ${template.description}`,
          is_deleted: false,
          split_method: template.split_type,
          payment_status: "unpaid",
        };

        const expenseId = await createExpenseInMongo(expenseData, participants);

        // Log the recurring expense run
        await RecurringExpenseRun.create({
          _id: newAppId(),
          template_id: template._id,
          owner_id: template.owner_id,
          created_expenses: [expenseId],
          run_date: todayIso,
          status: "completed",
          created_at: now,
        });

        // Log activity
        await logActivity({
          userIds: [template.owner_id, ...template.participant_ids],
          actorId: template.owner_id,
          actorName: "Recurring",
          type: "recurring_expense_created",
          title: "Recurring Expense Created",
          description: `Recurring expense "${template.description}" was automatically created`,
          metadata: { templateId: String(template._id), expenseId },
        });

        // Advance next run date
        const nextRunDate = advanceNextRunDate(todayIso, template.frequency, template.interval || 1);
        await RecurringExpenseTemplate.updateOne(
          { _id: template._id },
          { $set: { next_run_date: nextRunDate.split("T")[0] } }
        );

        results.push({ templateId: String(template._id), expenseId, error: null });
      } catch (err: any) {
        console.error(`[cron:recurring-expenses] Failed template ${template._id}:`, err);
        results.push({
          templateId: String(template._id),
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

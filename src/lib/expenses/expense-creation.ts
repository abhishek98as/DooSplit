import "server-only";

import {
  splitEqually,
  splitByExactAmounts,
  splitByPercentages,
  splitByShares,
  validateSplit,
} from "@/lib/splitCalculator";
import { notifyExpenseCreated } from "@/lib/notificationService";
import { invalidateUsersCache } from "@/lib/cache";
import { createExpenseInMongo } from "@/lib/mongodb/write-operations";
import { EXPENSE_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logExpenseAdded } from "@/lib/activity-logger";
import { isPaymentStatus } from "@/lib/expenses/payment-status";

function toStringId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

function extractUserId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if ("userId" in value) return extractUserId(value.userId);
    if ("id" in value) return extractUserId(value.id);
    if ("_id" in value) return extractUserId(value._id);
    if ("uid" in value) return extractUserId(value.uid);
  }

  return "";
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export interface ExpenseActor {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface ExpenseCreationMetadata {
  recurringTemplateId?: string | null;
  recurringRunId?: string | null;
  recurrenceOccurrenceDate?: string | null;
}

export interface CreateExpenseFromPayloadOptions {
  actor: ExpenseActor;
  payload: any;
  metadata?: ExpenseCreationMetadata;
  activityType?: "manual" | "recurring";
  notify?: boolean;
  invalidateCache?: boolean;
}

export interface CreatedExpenseResult {
  expenseId: string;
  expense: any;
  affectedUserIds: string[];
  firestoreParticipants: any[];
}

export function validateExpensePayload(payload: any): string | null {
  const { amount, description, paidBy, payers, participants, images } = payload || {};

  const hasPayers = Array.isArray(payers) && payers.length > 0;
  if (!amount || !description || (!paidBy && !hasPayers) || !participants || participants.length === 0) {
    return "Missing required fields";
  }
  if (Number(amount) <= 0) {
    return "Amount must be greater than 0";
  }
  if (hasPayers) {
    const totalPaid = payers.reduce(
      (sum: number, p: any) => sum + Number(p?.amount || 0),
      0
    );
    if (Math.abs(totalPaid - Number(amount)) > 0.01) {
      return `Payer amounts (${totalPaid}) must equal expense amount (${amount})`;
    }
  }
  if (images && Array.isArray(images)) {
    if (images.length > 10) {
      return "Maximum 10 images allowed per expense";
    }
    const invalidImages = images.filter(
      (img: any) => typeof img !== "string" || !img.trim()
    );
    if (invalidImages.length > 0) {
      return "All image references must be valid strings";
    }
  }
  return null;
}

function resolvePaidByInput(payload: any, actorId: string) {
  const { paidBy, payers, amount } = payload || {};
  if (Array.isArray(payers) && payers.length > 0) {
    return payers
      .map((p: any) => ({
        userId: extractUserId(p?.userId ?? p?.id ?? p),
        amount: Number(p?.amount || 0),
      }))
      .filter((p: any) => Boolean(p.userId));
  }
  return extractUserId(paidBy) || actorId;
}

export function buildSplitParticipants(payload: any, actorId: string): any[] {
  const { amount, participants, splitMethod } = payload || {};
  const paidByInput = resolvePaidByInput(payload, actorId);
  const payerIds = Array.isArray(paidByInput)
    ? paidByInput.map((p) => String(p.userId))
    : [String(paidByInput)];

  const participantIds = uniqueIds([
    ...(participants || []).map((p: any) => extractUserId(p?.userId ?? p)),
    ...payerIds,
  ]);

  if (participantIds.length === 0) {
    throw new Error("No valid participants provided");
  }

  const totalAmount = Number(amount);
  switch (splitMethod) {
    case "equally":
      return splitEqually({
        amount: totalAmount,
        participants: participantIds,
        paidBy: paidByInput,
      });
    case "exact": {
      const exactParticipants = (participants || [])
        .map((p: any) => ({
          userId: extractUserId(p?.userId ?? p),
          owedAmount: Number(p?.exactAmount ?? p?.owedAmount ?? 0),
        }))
        .filter((p: any) => Boolean(p.userId));
      for (const payerId of payerIds) {
        if (!exactParticipants.some((p: any) => p.userId === payerId)) {
          exactParticipants.push({ userId: payerId, owedAmount: 0 });
        }
      }
      return splitByExactAmounts({
        amount: totalAmount,
        participants: exactParticipants,
        paidBy: paidByInput,
      });
    }
    case "percentage": {
      const percentageParticipants = (participants || [])
        .map((p: any) => ({
          userId: extractUserId(p?.userId ?? p),
          percentage: Number(p?.percentage || 0),
        }))
        .filter((p: any) => Boolean(p.userId));
      for (const payerId of payerIds) {
        if (!percentageParticipants.some((p: any) => p.userId === payerId)) {
          percentageParticipants.push({ userId: payerId, percentage: 0 });
        }
      }
      return splitByPercentages({
        amount: totalAmount,
        participants: percentageParticipants,
        paidBy: paidByInput,
      });
    }
    case "shares": {
      const shareParticipants = (participants || [])
        .map((p: any) => ({
          userId: extractUserId(p?.userId ?? p),
          shares: Number(p?.shares || 1),
        }))
        .filter((p: any) => Boolean(p.userId));
      for (const payerId of payerIds) {
        if (!shareParticipants.some((p: any) => p.userId === payerId)) {
          shareParticipants.push({ userId: payerId, shares: 0 });
        }
      }
      return splitByShares({
        amount: totalAmount,
        participants: shareParticipants,
        paidBy: paidByInput,
      });
    }
    default:
      throw new Error("Invalid split method");
  }
}

export async function createExpenseFromPayload({
  actor,
  payload,
  metadata = {},
  activityType = "manual",
  notify = true,
  invalidateCache = true,
}: CreateExpenseFromPayloadOptions): Promise<CreatedExpenseResult> {
  const validationError = validateExpensePayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const splitParticipants = buildSplitParticipants(payload, actor.id);
  const totalAmount = Number(payload.amount);
  if (!validateSplit(splitParticipants, totalAmount)) {
    throw new Error("Invalid split calculation");
  }

  const nowIso = new Date().toISOString();
  const expenseData: Record<string, any> = {
    amount: totalAmount,
    description: String(payload.description),
    category: payload.category || "other",
    date: payload.date || metadata.recurrenceOccurrenceDate || nowIso,
    currency: payload.currency || "INR",
    created_by: actor.id,
    group_id: payload.groupId || null,
    images: Array.isArray(payload.images) ? payload.images : [],
    notes: payload.notes || "",
    is_deleted: false,
    split_method: payload.splitMethod || "equally",
    payment_status: isPaymentStatus(payload.paymentStatus)
      ? payload.paymentStatus
      : "unpaid",
    payment_status_updated_at: nowIso,
    payment_status_updated_by: actor.id,
  };

  if (metadata.recurringTemplateId) {
    expenseData.recurring_template_id = metadata.recurringTemplateId;
  }
  if (metadata.recurringRunId) {
    expenseData.recurring_run_id = metadata.recurringRunId;
  }
  if (metadata.recurrenceOccurrenceDate) {
    expenseData.recurrence_occurrence_date = metadata.recurrenceOccurrenceDate;
  }

  const firestoreParticipants = splitParticipants.map((participant) => ({
    user_id: toStringId(participant.userId),
    paid_amount: Number(participant.paidAmount || 0),
    owed_amount: Number(participant.owedAmount || 0),
    is_settled: false,
  }));

  const expenseId = await createExpenseInMongo(expenseData, firestoreParticipants);
  const affectedUserIds = uniqueIds([
    actor.id,
    ...firestoreParticipants.map((participant) => toStringId(participant.user_id)),
  ]);

  // 🔔 Budget exceeded check — fire-and-forget push notification
  void (async () => {
    try {
      const { getUserBudgets } = await import("@/lib/dynamodb/entities/budgets");
      const budgets = await getUserBudgets(actor.id);
      const cat = String(expenseData.category || "other");
      const categoryBudget = budgets[cat]?.monthly;

      if (categoryBudget && categoryBudget > 0) {
        const { listExpensesByCreator } = await import("@/lib/dynamodb/entities/expenses");
        const nowDate = new Date();
        const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString();

        const monthlyExpenses = await listExpensesByCreator(actor.id, {
          category: cat,
          startDate: startOfMonth,
        });

        let monthlySpend = 0;
        for (const exp of monthlyExpenses) {
          if (exp.is_deleted) continue;
          monthlySpend += Number(exp.amount || 0);
        }

        if (monthlySpend > categoryBudget) {
          const overBy = Math.round(monthlySpend - categoryBudget);
          const { sendPushNotificationToUsers } = await import("@/lib/firebase-messaging-admin");
          await sendPushNotificationToUsers([actor.id], {
            title: "⚠️ Budget Exceeded",
            body: `You're ₹${overBy} over your ${cat} budget this month (₹${Math.round(monthlySpend)} / ₹${categoryBudget}).`,
            data: { type: "budget_alert", category: cat, actionHref: "/analytics" },
          });
        }
      }
    } catch (budgetErr) {
      console.error("[expense-creation] Budget push check failed:", budgetErr);
    }
  })();

  let groupName: string | undefined;
  if (payload.groupId) {
    const { getGroupById } = await import("@/lib/dynamodb/entities/groups");
    const groupDoc = await getGroupById(String(payload.groupId));
    groupName = groupDoc
      ? String(groupDoc.name || "").trim() || undefined
      : undefined;
  }

  if (notify) {
    try {
      await notifyExpenseCreated(
        expenseId,
        String(payload.description),
        totalAmount,
        String(payload.currency || "INR"),
        {
          id: actor.id,
          name: actor.name || "Someone",
        },
        affectedUserIds,
        groupName
      );
    } catch (notificationError) {
      console.error("Failed to send expense notifications:", notificationError);
    }
  }

  void logExpenseAdded({
    actorId: actor.id,
    actorName: actor.name || "Someone",
    expenseId,
    description: String(payload.description),
    amount: totalAmount,
    currency: payload.currency || "INR",
    groupId: payload.groupId || null,
    groupName: groupName || null,
    participantIds: firestoreParticipants.map((p) => toStringId(p.user_id)),
  });

  if (activityType === "recurring") {
    // A second, explicit activity type lets the inbox distinguish generated runs
    // without changing legacy expense_added readers.
    const { logActivity } = await import("@/lib/activity-logger");
    void logActivity({
      userIds: affectedUserIds,
      actorId: actor.id,
      actorName: actor.name || "Someone",
      type: "recurring_expense_created",
      title: "Recurring Expense Created",
      description: `Recurring expense "${String(payload.description)}" was added`,
      metadata: {
        expenseId,
        recurringTemplateId: metadata.recurringTemplateId || null,
        recurringRunId: metadata.recurringRunId || null,
        occurrenceDate: metadata.recurrenceOccurrenceDate || null,
        amount: totalAmount,
        currency: payload.currency || "INR",
      },
    });
  }

  if (invalidateCache) {
    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);
  }

  const responseExpense = {
    _id: expenseId,
    amount: totalAmount,
    description: String(payload.description),
    category: payload.category || "other",
    date: payload.date || metadata.recurrenceOccurrenceDate || nowIso,
    currency: payload.currency || "INR",
    createdBy: actor.id,
    groupId: payload.groupId || undefined,
    images: Array.isArray(payload.images) ? payload.images : [],
    notes: payload.notes || "",
    paymentStatus: expenseData.payment_status,
    recurringTemplateId: metadata.recurringTemplateId || undefined,
    recurringRunId: metadata.recurringRunId || undefined,
    recurrenceOccurrenceDate: metadata.recurrenceOccurrenceDate || undefined,
    participants: splitParticipants.map((participant) => ({
      userId: toStringId(participant.userId),
      paidAmount: Number(participant.paidAmount || 0),
      owedAmount: Number(participant.owedAmount || 0),
    })),
    splitMethod: payload.splitMethod || "equally",
    version: 1,
    lastModified: nowIso,
    modifiedBy: actor.id,
    isDeleted: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    expenseId,
    expense: responseExpense,
    affectedUserIds,
    firestoreParticipants,
  };
}

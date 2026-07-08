import "server-only";

import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  addRecurringInterval,
  firstRunAfter,
  getRunKey,
  isRecurringFrequency,
  isRecurringStatus,
  normalizeDayOfMonth,
  normalizeRecurringInterval,
  toDateOnlyIso,
  type RecurringFrequency,
  type RecurringStatus,
} from "@/lib/recurring/recurrence";
import { createExpenseFromPayload, validateExpensePayload } from "@/lib/expenses/expense-creation";
import { fetchDocsByIds, toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { newAppId } from "@/lib/ids";

export interface RecurringTemplateResponse {
  id: string;
  name: string;
  status: RecurringStatus;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number | null;
  timezone: string;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  lastRunAt: string;
  reminderEnabled: boolean;
  reminderDaysBefore: number;
  expense: any;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
}

function extractUserId(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    if ("userId" in value) return extractUserId(value.userId);
    if ("id" in value) return extractUserId(value.id);
    if ("_id" in value) return extractUserId(value._id);
    if ("uid" in value) return extractUserId(value.uid);
  }
  return "";
}

function getParticipantIds(payload: any, ownerId: string): string[] {
  const paidBy = extractUserId(payload?.paidBy) || ownerId;
  return uniqueStrings([
    paidBy,
    ...((payload?.participants || []) as any[]).map((participant) =>
      extractUserId(participant?.userId ?? participant)
    ),
  ]);
}

export function mapRecurringTemplate(row: any): RecurringTemplateResponse {
  return {
    id: String(row.id || ""),
    name: String(row.name || row.expense_payload?.description || "Recurring expense"),
    status: isRecurringStatus(row.status) ? row.status : "active",
    frequency: isRecurringFrequency(row.frequency) ? row.frequency : "monthly",
    interval: normalizeRecurringInterval(row.interval),
    dayOfMonth: row.day_of_month === null || row.day_of_month === undefined
      ? null
      : Number(row.day_of_month),
    timezone: String(row.timezone || "Asia/Kolkata"),
    startDate: toIso(row.start_date),
    endDate: row.end_date ? toIso(row.end_date) : null,
    nextRunAt: toIso(row.next_run_at),
    lastRunAt: toIso(row.last_run_at),
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderDaysBefore: Number(row.reminder_days_before || 0),
    expense: row.expense_payload || {},
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids.map(String) : [],
    createdAt: toIso(row.created_at || row._created_at),
    updatedAt: toIso(row.updated_at || row._updated_at),
  };
}

export async function listRecurringTemplates(userId: string): Promise<RecurringTemplateResponse[]> {
  const db = getAdminDb();
  const [ownedSnap, participantSnap] = await Promise.all([
    db
      .collection(COLLECTIONS.recurringExpenseTemplates)
      .where("owner_id", "==", userId)
      .limit(200)
      .get(),
    db
      .collection(COLLECTIONS.recurringExpenseTemplates)
      .where("participant_ids", "array-contains", userId)
      .limit(200)
      .get(),
  ]);

  const dedup = new Map<string, any>();
  for (const doc of [...ownedSnap.docs, ...participantSnap.docs]) {
    dedup.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
  }
  return Array.from(dedup.values())
    .map(mapRecurringTemplate)
    .sort((a, b) => new Date(a.nextRunAt || 0).getTime() - new Date(b.nextRunAt || 0).getTime());
}

export async function getRecurringTemplate(templateId: string): Promise<any | null> {
  const doc = await getAdminDb()
    .collection(COLLECTIONS.recurringExpenseTemplates)
    .doc(templateId)
    .get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...(doc.data() || {}) };
}

export function assertTemplateAccess(template: any, userId: string, write = false) {
  if (!template) {
    throw new Error("Recurring expense not found");
  }
  if (write) {
    if (String(template.owner_id || "") !== userId) {
      throw new Error("Only the owner can update this recurring expense");
    }
    return;
  }
  const participantIds = Array.isArray(template.participant_ids)
    ? template.participant_ids.map(String)
    : [];
  if (String(template.owner_id || "") !== userId && !participantIds.includes(userId)) {
    throw new Error("Forbidden");
  }
}

export async function createRecurringTemplate(userId: string, body: any) {
  const expensePayload = body?.expense || body?.expensePayload || body;
  const validationError = validateExpensePayload(expensePayload);
  if (validationError) {
    throw new Error(validationError);
  }

  const frequency = isRecurringFrequency(body?.frequency) ? body.frequency : "monthly";
  const interval = normalizeRecurringInterval(body?.interval);
  const startDate = toDateOnlyIso(body?.startDate || expensePayload.date || new Date());
  const dayOfMonth =
    frequency === "monthly" || frequency === "yearly"
      ? normalizeDayOfMonth(body?.dayOfMonth, startDate)
      : null;
  const endDate = body?.endDate ? toDateOnlyIso(body.endDate) : null;
  const nextRunAt = firstRunAfter(
    {
      frequency,
      interval,
      dayOfMonth,
      startDate,
      endDate,
    },
    startDate
  ).toISOString();

  const participantIds = getParticipantIds(expensePayload, userId);
  const nowIso = new Date().toISOString();
  const templateId = newAppId();
  const template = {
    id: templateId,
    owner_id: userId,
    participant_ids: participantIds,
    name: String(body?.name || expensePayload.description || "Recurring expense"),
    status: "active",
    frequency,
    interval,
    day_of_month: dayOfMonth,
    timezone: String(body?.timezone || "Asia/Kolkata"),
    start_date: startDate,
    end_date: endDate,
    next_run_at: nextRunAt,
    last_run_at: null,
    reminder_enabled: Boolean(body?.reminderEnabled),
    reminder_days_before: Math.max(0, Math.min(14, Number(body?.reminderDaysBefore || 0))),
    expense_payload: {
      ...expensePayload,
      images: Array.isArray(expensePayload.images) ? expensePayload.images : [],
      groupId: expensePayload.groupId || null,
      paymentStatus: "unpaid",
    },
    created_at: nowIso,
    updated_at: nowIso,
    _created_at: FieldValue.serverTimestamp(),
    _updated_at: FieldValue.serverTimestamp(),
  };

  await getAdminDb()
    .collection(COLLECTIONS.recurringExpenseTemplates)
    .doc(templateId)
    .set(template);

  return mapRecurringTemplate(template);
}

export async function updateRecurringTemplate(templateId: string, userId: string, body: any) {
  const db = getAdminDb();
  const template = await getRecurringTemplate(templateId);
  assertTemplateAccess(template, userId, true);
  const existingTemplate = template as any;

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    updated_at: nowIso,
    _updated_at: FieldValue.serverTimestamp(),
  };

  if (body?.status !== undefined) {
    if (!isRecurringStatus(body.status)) {
      throw new Error("Invalid recurring status");
    }
    patch.status = body.status;
  }
  if (body?.name !== undefined) patch.name = String(body.name || "Recurring expense");
  if (body?.reminderEnabled !== undefined) patch.reminder_enabled = Boolean(body.reminderEnabled);
  if (body?.reminderDaysBefore !== undefined) {
    patch.reminder_days_before = Math.max(0, Math.min(14, Number(body.reminderDaysBefore || 0)));
  }

  const scheduleChanged =
    body?.frequency !== undefined ||
    body?.interval !== undefined ||
    body?.dayOfMonth !== undefined ||
    body?.startDate !== undefined ||
    body?.endDate !== undefined;

  const nextFrequency = isRecurringFrequency(body?.frequency)
    ? body.frequency
    : existingTemplate.frequency;
  const nextInterval = body?.interval !== undefined
    ? normalizeRecurringInterval(body.interval)
    : normalizeRecurringInterval(existingTemplate.interval);
  const nextStartDate = body?.startDate ? toDateOnlyIso(body.startDate) : toIso(existingTemplate.start_date);
  const nextDayOfMonth =
    nextFrequency === "monthly" || nextFrequency === "yearly"
      ? normalizeDayOfMonth(body?.dayOfMonth ?? existingTemplate.day_of_month, nextStartDate)
      : null;
  const nextEndDate = body?.endDate !== undefined
    ? body.endDate
      ? toDateOnlyIso(body.endDate)
      : null
    : existingTemplate.end_date
      ? toIso(existingTemplate.end_date)
      : null;

  if (scheduleChanged) {
    patch.frequency = nextFrequency;
    patch.interval = nextInterval;
    patch.day_of_month = nextDayOfMonth;
    patch.start_date = nextStartDate;
    patch.end_date = nextEndDate;
    patch.next_run_at = firstRunAfter(
      {
        frequency: nextFrequency,
        interval: nextInterval,
        dayOfMonth: nextDayOfMonth,
        startDate: nextStartDate,
        endDate: nextEndDate,
      },
      new Date()
    ).toISOString();
  }

  if (body?.expense !== undefined || body?.expensePayload !== undefined) {
    const expensePayload = body.expense || body.expensePayload;
    const validationError = validateExpensePayload(expensePayload);
    if (validationError) {
      throw new Error(validationError);
    }
    patch.expense_payload = {
      ...expensePayload,
      paymentStatus: "unpaid",
    };
    patch.participant_ids = getParticipantIds(expensePayload, userId);
  }

  await db.collection(COLLECTIONS.recurringExpenseTemplates).doc(templateId).set(patch, { merge: true });
  const updated = await getRecurringTemplate(templateId);
  return mapRecurringTemplate(updated);
}

export async function endRecurringTemplate(templateId: string, userId: string) {
  return updateRecurringTemplate(templateId, userId, { status: "ended" });
}

export async function runRecurringTemplate(input: {
  templateId: string;
  actorId?: string;
  force?: boolean;
  occurrenceDate?: string | null;
}) {
  const db = getAdminDb();
  const template = await getRecurringTemplate(input.templateId);
  if (!template) {
    throw new Error("Recurring expense not found");
  }
  if (input.actorId) {
    assertTemplateAccess(template, input.actorId, true);
  }
  if (template.status !== "active" && !input.force) {
    throw new Error("Recurring expense is not active");
  }

  const now = new Date();
  const scheduledOccurrence = toIso(template.next_run_at) || now.toISOString();
  const occurrenceDate = input.occurrenceDate
    ? toDateOnlyIso(input.occurrenceDate)
    : input.force
      ? toDateOnlyIso(now)
      : toDateOnlyIso(scheduledOccurrence);
  const runKey = getRunKey(String(template.id), occurrenceDate);
  const runRef = db.collection(COLLECTIONS.recurringExpenseRuns).doc(runKey);
  const existingRun = await runRef.get();
  if (existingRun.exists) {
    const nextRunAt = addRecurringInterval(
      occurrenceDate,
      template.frequency,
      template.interval,
      template.day_of_month
    ).toISOString();
    if (toDateOnlyIso(template.next_run_at || occurrenceDate) === occurrenceDate) {
      await db.collection(COLLECTIONS.recurringExpenseTemplates).doc(String(template.id)).set(
        {
          last_run_at: occurrenceDate,
          next_run_at: nextRunAt,
          updated_at: new Date().toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    return {
      run: { id: existingRun.id, ...(existingRun.data() || {}) },
      expense: null,
      duplicate: true,
    };
  }

  const ownerDoc = await db.collection(COLLECTIONS.users).doc(String(template.owner_id || "")).get();
  const owner = ownerDoc.exists
    ? { id: ownerDoc.id, ...(ownerDoc.data() || {}) }
    : { id: String(template.owner_id || ""), name: "Someone", email: "" };
  const nowIso = now.toISOString();

  await runRef.create({
    id: runKey,
    template_id: String(template.id || ""),
    owner_id: String(template.owner_id || ""),
    occurrence_date: occurrenceDate,
    status: "running",
    created_at: nowIso,
    updated_at: nowIso,
    _created_at: FieldValue.serverTimestamp(),
    _updated_at: FieldValue.serverTimestamp(),
  });

  try {
    const payload = {
      ...(template.expense_payload || {}),
      date: occurrenceDate,
      paymentStatus: "unpaid",
    };
    const result = await createExpenseFromPayload({
      actor: {
        id: String(owner.id || template.owner_id || ""),
        name: String(owner.name || "Someone"),
        email: String(owner.email || ""),
      },
      payload,
      metadata: {
        recurringTemplateId: String(template.id || ""),
        recurringRunId: runKey,
        recurrenceOccurrenceDate: occurrenceDate,
      },
      activityType: "recurring",
    });

    const nextRunAt = addRecurringInterval(
      occurrenceDate,
      template.frequency,
      template.interval,
      template.day_of_month
    ).toISOString();
    const endDate = template.end_date ? new Date(toIso(template.end_date)) : null;
    const nextStatus = endDate && new Date(nextRunAt) > endDate ? "ended" : template.status;

    await db.collection(COLLECTIONS.recurringExpenseTemplates).doc(String(template.id)).set(
      {
        last_run_at: occurrenceDate,
        next_run_at: nextRunAt,
        status: nextStatus,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await runRef.set(
      {
        status: "created",
        expense_id: result.expenseId,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      run: { id: runKey, status: "created", expenseId: result.expenseId },
      expense: result.expense,
      duplicate: false,
    };
  } catch (error: any) {
    await runRef.set(
      {
        status: "failed",
        error: error?.message || "Failed to create recurring expense",
        updated_at: new Date().toISOString(),
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }
}

export async function runDueRecurringTemplates(limit = 50) {
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const dueSnap = await db
    .collection(COLLECTIONS.recurringExpenseTemplates)
    .where("status", "==", "active")
    .where("next_run_at", "<=", nowIso)
    .orderBy("next_run_at", "asc")
    .limit(limit)
    .get();

  let createdCount = 0;
  let duplicateCount = 0;
  const errors: Array<{ templateId: string; error: string }> = [];

  for (const doc of dueSnap.docs) {
    let runsForTemplate = 0;
    while (runsForTemplate < 12) {
      const current = await getRecurringTemplate(doc.id);
      if (!current || current.status !== "active" || !current.next_run_at) break;
      if (new Date(toIso(current.next_run_at)).getTime() > Date.now()) break;

      try {
        const result = await runRecurringTemplate({
          templateId: doc.id,
          occurrenceDate: toIso(current.next_run_at),
        });
        if (result.duplicate) {
          duplicateCount += 1;
        } else {
          createdCount += 1;
        }
      } catch (error: any) {
        errors.push({ templateId: doc.id, error: error?.message || "Failed" });
        break;
      }
      runsForTemplate += 1;
    }
  }

  return {
    checked: dueSnap.size,
    createdCount,
    duplicateCount,
    errors,
  };
}

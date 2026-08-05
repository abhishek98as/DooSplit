import "server-only";

import {
  getRecurringTemplateById,
  listRecurringTemplatesByOwner,
  listRecurringTemplatesDue,
  listRecurringRuns,
  putRecurringRun,
  putRecurringTemplate,
  updateRecurringTemplate as updateRecurringTemplateEntity,
} from "@/lib/dynamodb/entities/recurring";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import type { DdbRecurringTemplate } from "@/lib/dynamodb/types";
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
import { toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
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

function deriveStatus(row: Partial<DdbRecurringTemplate>): RecurringStatus {
  if (isRecurringStatus(row.status)) return row.status;
  if (row.is_active === false) return "ended";
  if (row.is_active === true) return "active";
  return "active";
}

function deriveNextRunAt(row: Partial<DdbRecurringTemplate>): string {
  if (row.next_run_at) return toIso(row.next_run_at);
  if (row.next_run_date) return `${String(row.next_run_date).slice(0, 10)}T00:00:00.000Z`;
  return "";
}

function deriveLastRunAt(row: Partial<DdbRecurringTemplate>): string {
  if (row.last_run_at) return toIso(row.last_run_at);
  if (row.last_run_date) return `${String(row.last_run_date).slice(0, 10)}T00:00:00.000Z`;
  return "";
}

function ddbTemplateToRow(tmpl: DdbRecurringTemplate): Record<string, unknown> {
  return {
    ...tmpl,
    status: deriveStatus(tmpl),
    next_run_at: deriveNextRunAt(tmpl),
    last_run_at: deriveLastRunAt(tmpl),
  };
}

function syncScheduleFields(input: {
  nextRunAt?: string;
  lastRunAt?: string | null;
  status?: RecurringStatus;
}): {
  next_run_date?: string;
  next_run_at?: string;
  last_run_date?: string;
  last_run_at?: string | null;
  is_active?: boolean;
  status?: RecurringStatus;
} {
  const patch: {
    next_run_date?: string;
    next_run_at?: string;
    last_run_date?: string;
    last_run_at?: string | null;
    is_active?: boolean;
    status?: RecurringStatus;
  } = {};

  if (input.nextRunAt !== undefined) {
    patch.next_run_at = input.nextRunAt;
    patch.next_run_date = input.nextRunAt.slice(0, 10);
  }
  if (input.lastRunAt !== undefined) {
    patch.last_run_at = input.lastRunAt;
    patch.last_run_date = input.lastRunAt ? input.lastRunAt.slice(0, 10) : undefined;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.is_active = input.status === "active";
  }

  return patch;
}

function buildExpensePayloadFields(expensePayload: any) {
  return {
    description: String(expensePayload.description || "Recurring expense"),
    amount: Number(expensePayload.amount || 0),
    currency: String(expensePayload.currency || "INR"),
    category: expensePayload.category ? String(expensePayload.category) : undefined,
    split_type: String(expensePayload.splitMethod || expensePayload.split_type || "equally"),
    group_id: expensePayload.groupId ? String(expensePayload.groupId) : undefined,
  };
}

export function mapRecurringTemplate(row: any): RecurringTemplateResponse {
  const status = deriveStatus(row);
  const expensePayload = row.expense_payload || {};
  return {
    id: String(row.id || ""),
    name: String(row.name || row.description || expensePayload.description || "Recurring expense"),
    status,
    frequency: isRecurringFrequency(row.frequency) ? row.frequency : "monthly",
    interval: normalizeRecurringInterval(row.interval),
    dayOfMonth: row.day_of_month === null || row.day_of_month === undefined
      ? null
      : Number(row.day_of_month),
    timezone: String(row.timezone || "Asia/Kolkata"),
    startDate: toIso(row.start_date),
    endDate: row.end_date ? toIso(row.end_date) : null,
    nextRunAt: deriveNextRunAt(row),
    lastRunAt: deriveLastRunAt(row),
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderDaysBefore: Number(row.reminder_days_before || 0),
    expense: expensePayload,
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids.map(String) : [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listRecurringTemplates(userId: string): Promise<RecurringTemplateResponse[]> {
  const owned = await listRecurringTemplatesByOwner(userId);
  return owned
    .map((tmpl) => mapRecurringTemplate(ddbTemplateToRow(tmpl)))
    .sort((a, b) => new Date(a.nextRunAt || 0).getTime() - new Date(b.nextRunAt || 0).getTime());
}

export async function getRecurringTemplate(templateId: string): Promise<any | null> {
  const tmpl = await getRecurringTemplateById(templateId);
  if (!tmpl) {
    return null;
  }
  return ddbTemplateToRow(tmpl);
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
  const normalizedExpensePayload = {
    ...expensePayload,
    images: Array.isArray(expensePayload.images) ? expensePayload.images : [],
    groupId: expensePayload.groupId || null,
    paymentStatus: "unpaid",
  };
  const expenseFields = buildExpensePayloadFields(normalizedExpensePayload);

  const template: Omit<
    DdbRecurringTemplate,
    "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK"
  > = {
    id: templateId,
    owner_id: userId,
    participant_ids: participantIds,
    name: String(body?.name || expenseFields.description),
    status: "active",
    frequency,
    interval,
    day_of_month: dayOfMonth,
    timezone: String(body?.timezone || "Asia/Kolkata"),
    start_date: startDate,
    end_date: endDate || undefined,
    next_run_date: nextRunAt.slice(0, 10),
    next_run_at: nextRunAt,
    last_run_at: null,
    is_active: true,
    run_count: 0,
    reminder_enabled: Boolean(body?.reminderEnabled),
    reminder_days_before: Math.max(0, Math.min(14, Number(body?.reminderDaysBefore || 0))),
    expense_payload: normalizedExpensePayload,
    created_at: nowIso,
    updated_at: nowIso,
    ...expenseFields,
  };

  await putRecurringTemplate(template);

  return mapRecurringTemplate(ddbTemplateToRow(template as DdbRecurringTemplate));
}

export async function updateRecurringTemplate(templateId: string, userId: string, body: any) {
  const template = await getRecurringTemplate(templateId);
  assertTemplateAccess(template, userId, true);
  const existingTemplate = template as any;

  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    updated_at: nowIso,
  };

  if (body?.status !== undefined) {
    if (!isRecurringStatus(body.status)) {
      throw new Error("Invalid recurring status");
    }
    Object.assign(patch, syncScheduleFields({ status: body.status }));
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
    const nextRunAt = firstRunAfter(
      {
        frequency: nextFrequency,
        interval: nextInterval,
        dayOfMonth: nextDayOfMonth,
        startDate: nextStartDate,
        endDate: nextEndDate,
      },
      new Date()
    ).toISOString();
    patch.frequency = nextFrequency;
    patch.interval = nextInterval;
    patch.day_of_month = nextDayOfMonth;
    patch.start_date = nextStartDate;
    patch.end_date = nextEndDate || undefined;
    Object.assign(patch, syncScheduleFields({ nextRunAt }));
  }

  if (body?.expense !== undefined || body?.expensePayload !== undefined) {
    const expensePayload = body.expense || body.expensePayload;
    const validationError = validateExpensePayload(expensePayload);
    if (validationError) {
      throw new Error(validationError);
    }
    const normalizedExpensePayload = {
      ...expensePayload,
      paymentStatus: "unpaid",
    };
    patch.expense_payload = normalizedExpensePayload;
    patch.participant_ids = getParticipantIds(expensePayload, userId);
    Object.assign(patch, buildExpensePayloadFields(normalizedExpensePayload));
  }

  await updateRecurringTemplateEntity(templateId, patch);
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
  const template = await getRecurringTemplate(input.templateId);
  if (!template) {
    throw new Error("Recurring expense not found");
  }
  if (input.actorId) {
    assertTemplateAccess(template, input.actorId, true);
  }
  const status = deriveStatus(template);
  if (status !== "active" && !input.force) {
    throw new Error("Recurring expense is not active");
  }

  const now = new Date();
  const scheduledOccurrence = deriveNextRunAt(template) || now.toISOString();
  const occurrenceDate = input.occurrenceDate
    ? toDateOnlyIso(input.occurrenceDate)
    : input.force
      ? toDateOnlyIso(now)
      : toDateOnlyIso(scheduledOccurrence);
  const runKey = getRunKey(String(template.id), occurrenceDate);
  const existingRuns = await listRecurringRuns(String(template.id));
  const existingRun = existingRuns.find((run) => run.run_date === occurrenceDate || run.id === runKey);
  if (existingRun) {
    const nextRunAt = addRecurringInterval(
      occurrenceDate,
      template.frequency,
      template.interval,
      template.day_of_month
    ).toISOString();
    if (toDateOnlyIso(deriveNextRunAt(template) || occurrenceDate) === occurrenceDate) {
      await updateRecurringTemplateEntity(String(template.id), {
        last_run_date: occurrenceDate,
        last_run_at: occurrenceDate,
        ...syncScheduleFields({ nextRunAt }),
        updated_at: new Date().toISOString(),
      });
    }
    return {
      run: existingRun,
      expense: null,
      duplicate: true,
    };
  }

  const owners = await getUsersByIds([String(template.owner_id || "")]);
  const ownerDoc = owners[0];
  const owner = ownerDoc
    ? { id: ownerDoc.id, name: ownerDoc.name, email: ownerDoc.email }
    : { id: String(template.owner_id || ""), name: "Someone", email: "" };
  const nowIso = now.toISOString();

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
    const nextStatus: RecurringStatus =
      endDate && new Date(nextRunAt) > endDate ? "ended" : status;

    await updateRecurringTemplateEntity(String(template.id), {
      last_run_date: occurrenceDate,
      last_run_at: occurrenceDate,
      run_count: Number(template.run_count || 0) + 1,
      ...syncScheduleFields({ nextRunAt, status: nextStatus }),
      updated_at: nowIso,
    });
    await putRecurringRun({
      id: runKey,
      template_id: String(template.id || ""),
      owner_id: String(template.owner_id || ""),
      run_date: occurrenceDate,
      expense_id: result.expenseId,
      status: "success",
      created_at: nowIso,
    });

    return {
      run: { id: runKey, status: "success", expenseId: result.expenseId },
      expense: result.expense,
      duplicate: false,
    };
  } catch (error: any) {
    await putRecurringRun({
      id: runKey,
      template_id: String(template.id || ""),
      owner_id: String(template.owner_id || ""),
      run_date: occurrenceDate,
      status: "failed",
      error: error?.message || "Failed to create recurring expense",
      created_at: nowIso,
    });
    throw error;
  }
}

export async function runDueRecurringTemplates(limit = 50) {
  const todayIso = new Date().toISOString().split("T")[0];
  const dueTemplates = (await listRecurringTemplatesDue(todayIso)).slice(0, limit);

  let createdCount = 0;
  let duplicateCount = 0;
  const errors: Array<{ templateId: string; error: string }> = [];

  for (const doc of dueTemplates) {
    let runsForTemplate = 0;
    while (runsForTemplate < 12) {
      const current = await getRecurringTemplate(doc.id);
      if (!current || deriveStatus(current) !== "active" || !deriveNextRunAt(current)) break;
      if (new Date(deriveNextRunAt(current)).getTime() > Date.now()) break;

      try {
        const result = await runRecurringTemplate({
          templateId: doc.id,
          occurrenceDate: deriveNextRunAt(current),
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
    checked: dueTemplates.length,
    createdCount,
    duplicateCount,
    errors,
  };
}

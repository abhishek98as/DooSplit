export const RECURRING_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

export const RECURRING_STATUSES = ["active", "paused", "ended"] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

export interface RecurringScheduleInput {
  frequency: RecurringFrequency;
  interval?: number;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
}

export function isRecurringFrequency(value: any): value is RecurringFrequency {
  return RECURRING_FREQUENCIES.includes(String(value || "") as RecurringFrequency);
}

export function isRecurringStatus(value: any): value is RecurringStatus {
  return RECURRING_STATUSES.includes(String(value || "") as RecurringStatus);
}

function asUtcDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid recurrence date");
  }
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInUtcMonth(year, month));
}

export function normalizeRecurringInterval(value: any): number {
  const interval = Number(value || 1);
  if (!Number.isFinite(interval) || interval < 1) {
    return 1;
  }
  return Math.min(24, Math.floor(interval));
}

export function normalizeDayOfMonth(value: any, fallbackDate: string | Date): number {
  const fallback = asUtcDate(fallbackDate).getUTCDate();
  const day = Number(value || fallback);
  if (!Number.isFinite(day)) {
    return fallback;
  }
  return Math.min(31, Math.max(1, Math.floor(day)));
}

export function addRecurringInterval(
  fromValue: string | Date,
  frequency: RecurringFrequency,
  intervalValue = 1,
  dayOfMonth?: number | null
): Date {
  const from = asUtcDate(fromValue);
  const interval = normalizeRecurringInterval(intervalValue);

  if (frequency === "weekly") {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 7 * interval);
    return next;
  }

  if (frequency === "yearly") {
    const year = from.getUTCFullYear() + interval;
    const month = from.getUTCMonth();
    const targetDay = dayOfMonth || from.getUTCDate();
    return new Date(Date.UTC(year, month, clampDay(year, month, targetDay)));
  }

  const totalMonths = from.getUTCMonth() + interval;
  const year = from.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const targetDay = dayOfMonth || from.getUTCDate();
  return new Date(Date.UTC(year, month, clampDay(year, month, targetDay)));
}

export function firstRunAfter(
  schedule: RecurringScheduleInput,
  afterValue: string | Date
): Date {
  const start = asUtcDate(schedule.startDate);
  const after = asUtcDate(afterValue);
  const interval = normalizeRecurringInterval(schedule.interval);
  const dayOfMonth =
    schedule.frequency === "monthly" || schedule.frequency === "yearly"
      ? normalizeDayOfMonth(schedule.dayOfMonth, start)
      : null;

  let candidate = start;
  while (candidate <= after) {
    candidate = addRecurringInterval(
      candidate,
      schedule.frequency,
      interval,
      dayOfMonth
    );
  }
  return candidate;
}

export function getRunKey(templateId: string, occurrenceDate: string | Date): string {
  return `${templateId}_${asUtcDate(occurrenceDate).toISOString().slice(0, 10)}`;
}

export function toDateOnlyIso(value: string | Date): string {
  return asUtcDate(value).toISOString();
}

import "server-only";

import { queryUserExpenseFeed, listExpenseParticipants, listExpensesByCreator } from "@/lib/dynamodb/entities/expenses";
import { getGroupById } from "@/lib/dynamodb/entities/groups";
import {
  listNudgeStatesForUser,
  putNudgeState,
} from "@/lib/dynamodb/entities/nudges";
import {
  listRecurringRuns,
  listRecurringTemplatesByOwner,
} from "@/lib/dynamodb/entities/recurring";
import { queryUserSettlementFeed } from "@/lib/dynamodb/entities/settlements";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import type { DdbUserNudgeState } from "@/lib/dynamodb/types";
import {
  mapUser,
  toIso,
  toNum,
} from "@/lib/firestore/route-helpers";
import { logActivity } from "@/lib/activity-logger";
import { normalizePaymentStatus } from "@/lib/expenses/payment-status";

export type NudgeType =
  | "pending_expense"
  | "habit"
  | "followup"
  | "stale_partial_payment"
  | "stale_dispute"
  | "missed_recurring"
  | "upcoming_recurring"
  | "recurring_settlement_reminder"
  | "predicted_pattern";

export interface NudgeItem {
  id: string;
  type: NudgeType;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, any>;
  state?: {
    dismissedAt?: string;
    snoozedUntil?: string;
    actedAt?: string;
    lastShownAt?: string;
    lastInboxAt?: string;
  };
}

function toDateMs(value: any): number {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function diffDays(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}

function nudgeStateId(userId: string, nudgeId: string): string {
  return `${userId}_${nudgeId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
}

function mapNudgeState(row: any) {
  return {
    dismissedAt: toIso(row.dismissed_at || row.dismissedAt),
    snoozedUntil: toIso(row.snoozed_until || row.snoozedUntil),
    actedAt: toIso(row.acted_at || row.actedAt),
    lastShownAt: toIso(row.last_shown_at || row.lastShownAt),
    lastInboxAt: toIso(row.last_inbox_at || row.lastInboxAt),
  };
}

function flattenNudgeState(row: DdbUserNudgeState): Record<string, any> {
  const state = (row.state || {}) as Record<string, any>;
  return {
    id: nudgeStateId(row.user_id, row.nudge_id),
    user_id: row.user_id,
    nudge_id: row.nudge_id,
    dismissed_at: state.dismissed_at || state.dismissedAt,
    snoozed_until: state.snoozed_until || state.snoozedUntil,
    acted_at: state.acted_at || state.actedAt,
    last_shown_at: state.last_shown_at || state.lastShownAt,
    last_inbox_at: state.last_inbox_at || state.lastInboxAt,
    status: state.status,
    nudge_count: row.nudge_count,
    updated_at: row.updated_at,
  };
}

async function fetchUserNudgeStates(userId: string): Promise<Map<string, any>> {
  const rows = await listNudgeStatesForUser(userId);
  const map = new Map<string, any>();
  for (const row of rows) {
    map.set(String(row.nudge_id || ""), flattenNudgeState(row));
  }
  return map;
}

async function persistNudgeState(input: {
  userId: string;
  nudgeId: string;
  existing?: any;
  patch: Record<string, unknown>;
}) {
  const nowIso = new Date().toISOString();
  const existingState = (input.existing || {}) as Record<string, unknown>;
  const nextState = {
    ...existingState,
    ...input.patch,
  };

  await putNudgeState({
    user_id: input.userId,
    nudge_id: input.nudgeId,
    state: nextState,
    nudge_count: Number(input.existing?.nudge_count || 0) + 1,
    last_nudge_at: nowIso,
    created_at: String(input.existing?.created_at || nowIso),
    updated_at: nowIso,
  });
}

async function buildCandidateNudges(userId: string): Promise<NudgeItem[]> {
  const now = Date.now();
  const { items: feedItems } = await queryUserExpenseFeed(userId, 200);
  const nudges: NudgeItem[] = [];

  for (const feed of feedItems) {
    if (feed.is_deleted) continue;

    const status = normalizePaymentStatus(feed.payment_status, "unpaid");
    const expenseId = String(feed.expense_id || "");
    const expenseDateMs = toDateMs(feed.date || feed.created_at);
    const ageDays = diffDays(expenseDateMs, now);
    const owedAmount = toNum(feed.amount_owed);
    const paidAmount = toNum(feed.amount_paid);
    const pendingAmount = Math.max(0, owedAmount - paidAmount);

    if (pendingAmount > 0 && ageDays >= 10 && status !== "paid") {
      nudges.push({
        id: `pending_${expenseId}`,
        type: "pending_expense",
        severity: ageDays >= 20 ? "high" : "medium",
        title: `Pending for ${ageDays} days`,
        message: `You still have ${pendingAmount.toFixed(2)} pending for "${String(feed.description || "Expense")}".`,
        actionLabel: "Review expense",
        actionHref: `/expenses/edit/${expenseId}`,
        metadata: { expenseId, pendingAmount, ageDays },
      });
    }

    if (status === "partially_paid" && ageDays >= 7) {
      nudges.push({
        id: `stale_partial_${expenseId}`,
        type: "stale_partial_payment",
        severity: ageDays >= 20 ? "high" : "medium",
        title: "Partial payment needs a follow-up",
        message: `"${String(feed.description || "Expense")}" is still partially paid after ${ageDays} days.`,
        actionLabel: "Review expense",
        actionHref: `/expenses/edit/${expenseId}`,
        metadata: { expenseId, ageDays },
      });
    }

    if (status === "disputed" && ageDays >= 3) {
      nudges.push({
        id: `stale_dispute_${expenseId}`,
        type: "stale_dispute",
        severity: ageDays >= 14 ? "high" : "medium",
        title: "Dispute still open",
        message: `"${String(feed.description || "Expense")}" has been disputed for ${ageDays} days.`,
        actionLabel: "Open discussion",
        actionHref: `/expenses/edit/${expenseId}`,
        metadata: { expenseId, ageDays },
      });
    }
  }

  nudges.sort(
    (a, b) => Number(b.metadata?.ageDays || 0) - Number(a.metadata?.ageDays || 0)
  );

  const { items: settlementItems } = await queryUserSettlementFeed(userId, 500);
  const settlementRows = settlementItems.filter((row) => row.from_user_id === userId);

  const last90DaysMs = now - 90 * 24 * 60 * 60 * 1000;
  const recentSettlements = settlementRows.filter((row) =>
    toDateMs(row.date || row.created_at) >= last90DaysMs
  );
  if (recentSettlements.length >= 4) {
    const weekendCount = recentSettlements.filter((row) => {
      const day = new Date(toDateMs(row.date || row.created_at)).getDay();
      return day === 0 || day === 6;
    }).length;
    const weekendRatio = weekendCount / recentSettlements.length;
    if (weekendRatio >= 0.6) {
      nudges.push({
        id: "habit_weekend_settlement",
        type: "habit",
        severity: "low",
        title: "Weekend settlement pattern detected",
        message: "You usually settle on weekends. Set the next payment reminder for this weekend.",
        actionLabel: "Set reminder",
        actionHref: "/settlements",
        metadata: { weekendRatio, sampleSize: recentSettlements.length },
      });
    }
  }

  const counterpartyCounts = new Map<string, number>();
  for (const row of recentSettlements) {
    const toUserId = String(row.to_user_id || "");
    if (toUserId) {
      counterpartyCounts.set(toUserId, (counterpartyCounts.get(toUserId) || 0) + 1);
    }
  }
  const topCounterparty = Array.from(counterpartyCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topCounterparty && topCounterparty[1] >= 2) {
    const users = await getUsersByIds([topCounterparty[0]]);
    const topFriend = users[0] ? mapUser(users[0]) : null;
    if (topFriend) {
      const friendId = String(topFriend.id || topFriend._id || "");
      nudges.push({
        id: `followup_counterparty_${friendId}`,
        type: "followup",
        severity: "low",
        title: "Frequent follow-up opportunity",
        message: `You settle often with ${topFriend.name}. A monthly check-in can close balances faster.`,
        actionLabel: "Open friend details",
        actionHref: `/friends/${friendId}`,
        metadata: { friendId, settlementCount: topCounterparty[1] },
      });
    }
  }

  const templates = await listRecurringTemplatesByOwner(userId);
  for (const template of templates) {
    if (!template.is_active && template.status !== "active") continue;
    const nextRunMs = toDateMs(template.next_run_at || template.next_run_date);
    if (!nextRunMs) continue;
    const daysUntil = Math.ceil((nextRunMs - now) / (1000 * 60 * 60 * 24));
    const title = String(template.name || template.description || template.expense_payload?.description || "Recurring expense");
    if (nextRunMs < now) {
      nudges.push({
        id: `missed_recurring_${template.id}`,
        type: "missed_recurring",
        severity: "high",
        title: "Recurring expense is overdue",
        message: `"${title}" has a missed run waiting to be recovered.`,
        actionLabel: "Review recurring expenses",
        actionHref: "/recurring-expenses",
        metadata: {
          recurringTemplateId: template.id,
          nextRunAt: toIso(template.next_run_at || template.next_run_date),
        },
      });
    } else if (daysUntil >= 0 && daysUntil <= 3) {
      nudges.push({
        id: `upcoming_recurring_${template.id}`,
        type: "upcoming_recurring",
        severity: "low",
        title: "Recurring expense coming up",
        message: `"${title}" is scheduled in ${daysUntil === 0 ? "today" : `${daysUntil} day${daysUntil === 1 ? "" : "s"}`}.`,
        actionLabel: "Review recurring expenses",
        actionHref: "/recurring-expenses",
        metadata: {
          recurringTemplateId: template.id,
          nextRunAt: toIso(template.next_run_at || template.next_run_date),
          daysUntil,
        },
      });
    }
  }

  return nudges.slice(0, 12);
}

async function buildRecurringSettlementNudges(userId: string): Promise<NudgeItem[]> {
  const now = Date.now();
  const nudges: NudgeItem[] = [];
  const templates = (await listRecurringTemplatesByOwner(userId))
    .filter((template) => template.is_active || template.status === "active")
    .slice(0, 50);

  for (const template of templates) {
    const templateId = template.id;
    const templateName = String(
      template.name || template.description || template.expense_payload?.description || "Recurring expense"
    );
    const runs = await listRecurringRuns(templateId);
    const lastRun = runs[0];
    const runExpenseId = String(lastRun?.expense_id || "");
    if (!runExpenseId) continue;

    const participants = await listExpenseParticipants(runExpenseId);
    let totalUnpaid = 0;
    const unpaidUserIds: string[] = [];
    for (const participant of participants) {
      const owed = toNum(participant.amount_owed);
      const paid = toNum(participant.amount_paid);
      const pending = Math.max(0, owed - paid);
      if (pending > 0.01 && String(participant.user_id || "") !== userId) {
        totalUnpaid += pending;
        unpaidUserIds.push(String(participant.user_id || ""));
      }
    }

    if (totalUnpaid <= 0.01 || unpaidUserIds.length === 0) continue;

    const runAtMs = toDateMs(lastRun.run_date || lastRun.created_at);
    const ageDays = Math.floor((now - runAtMs) / (1000 * 60 * 60 * 24));
    if (ageDays < 3) continue;

    const users = await getUsersByIds(unpaidUserIds);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const debtorNames = unpaidUserIds
      .map((uid) => {
        const user = usersById.get(uid);
        return user ? String(user.name || "") : null;
      })
      .filter(Boolean)
      .slice(0, 2);

    const namesStr = debtorNames.length > 0
      ? debtorNames.join(" & ")
      : `${unpaidUserIds.length} member(s)`;

    nudges.push({
      id: `recurring_settle_${templateId}`,
      type: "recurring_settlement_reminder",
      severity: ageDays >= 10 ? "high" : "medium",
      title: `Unpaid recurring: ${templateName}`,
      message: `${namesStr} still owe${debtorNames.length === 1 ? "s" : ""} from the last "${templateName}" run (${ageDays} days ago). Send them a reminder?`,
      actionLabel: "Send Reminder",
      actionHref: `/settlements`,
      metadata: {
        templateId,
        expenseId: runExpenseId,
        unpaidUserIds,
        totalUnpaid,
        ageDays,
        debtorNames,
      },
    });
  }

  return nudges;
}

async function buildPatternNudges(userId: string): Promise<NudgeItem[]> {
  const now = new Date();
  const todayDom = now.getDate();
  const nudges: NudgeItem[] = [];
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expenses = (await listExpensesByCreator(userId, { startDate: sixMonthsAgo }))
    .filter((expense) => !expense.is_deleted)
    .slice(0, 120);

  if (expenses.length === 0) return nudges;

  type PatternKey = string;
  const patternMap = new Map<PatternKey, { dates: number[]; category: string; groupId?: string }>();

  for (const exp of expenses) {
    const dateVal = new Date(exp.date || 0);
    if (Number.isNaN(dateVal.getTime())) continue;
    const dom = dateVal.getDate();
    const groupId = String(exp.group_id || "");
    const category = String(exp.category || "other");
    const key: PatternKey = `${groupId}_${category}`;
    if (!patternMap.has(key)) {
      patternMap.set(key, { dates: [], category, groupId: groupId || undefined });
    }
    patternMap.get(key)!.dates.push(dom);
  }

  const WINDOW = 4;
  for (const [key, pattern] of patternMap.entries()) {
    if (pattern.dates.length < 3) continue;
    const nearToday = pattern.dates.filter(
      (dom) => Math.abs(dom - todayDom) <= WINDOW || Math.abs(dom - todayDom + 31) <= WINDOW
    );
    if (nearToday.length < 3) continue;

    const nudgeId = `pattern_${key}`;
    const categoryLabel =
      pattern.category === "utilities" ? "utilities" :
      pattern.category === "food" ? "food" :
      pattern.category === "rent" ? "rent" :
      pattern.category;

    let contextStr = "";
    if (pattern.groupId) {
      try {
        const group = await getGroupById(pattern.groupId);
        if (group) {
          contextStr = ` with "${String(group.name || "your group")}"`;
        }
      } catch {
        // non-critical
      }
    }

    nudges.push({
      id: nudgeId,
      type: "predicted_pattern",
      severity: "low",
      title: `Predicted: ${categoryLabel} expense`,
      message: `You usually add ${categoryLabel} expenses${contextStr} around the ${todayDom}${todayDom === 1 ? "st" : todayDom === 2 ? "nd" : todayDom === 3 ? "rd" : "th"}. Ready to log it?`,
      actionLabel: "Quick Add",
      actionHref: `/quick-add`,
      metadata: { category: pattern.category, groupId: pattern.groupId, occurrences: nearToday.length },
    });

    if (nudges.length >= 2) break;
  }

  return nudges;
}

async function materializeInboxNudges(userId: string, nudges: NudgeItem[], states: Map<string, any>) {
  const now = Date.now();
  const nowIso = new Date().toISOString();
  const cooldownMs = 24 * 60 * 60 * 1000;

  for (const nudge of nudges.slice(0, 4)) {
    const state = states.get(nudge.id);
    const lastInboxMs = toDateMs(state?.last_inbox_at);
    if (lastInboxMs && now - lastInboxMs < cooldownMs) {
      continue;
    }

    await logActivity({
      userIds: [userId],
      actorId: userId,
      actorName: "DooSplit",
      type: "smart_nudge",
      title: nudge.title,
      description: nudge.message,
      metadata: {
        nudgeId: nudge.id,
        nudgeType: nudge.type,
        severity: nudge.severity,
        actionHref: nudge.actionHref || null,
        actionLabel: nudge.actionLabel || null,
        ...(nudge.metadata || {}),
      },
    });

    if (nudge.severity === "high" || nudge.severity === "medium") {
      try {
        const { sendPushNotificationToUsers } = await import("@/lib/firebase-messaging-admin");
        await sendPushNotificationToUsers([userId], {
          title: nudge.title,
          body: nudge.message,
          data: {
            type: "smart_nudge",
            nudgeId: nudge.id,
            nudgeType: nudge.type,
            actionHref: nudge.actionHref || "",
          },
        });
      } catch (fcmErr) {
        console.error("[nudges] FCM push failed for nudge", nudge.id, fcmErr);
      }
    }

    await persistNudgeState({
      userId,
      nudgeId: nudge.id,
      existing: state,
      patch: {
        status: "active",
        last_inbox_at: nowIso,
      },
    });
  }
}

export async function getSmartNudges(userId: string): Promise<{ nudges: NudgeItem[]; generatedAt: string }> {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const [candidates, recurringSettlementNudges, patternNudges, states] = await Promise.all([
    buildCandidateNudges(userId),
    buildRecurringSettlementNudges(userId),
    buildPatternNudges(userId),
    fetchUserNudgeStates(userId),
  ]);

  const allCandidates = [
    ...candidates,
    ...recurringSettlementNudges,
    ...patternNudges,
  ];

  const visible = allCandidates
    .map((nudge) => {
      const state = states.get(nudge.id);
      if (state?.dismissed_at) return null;
      const snoozedUntilMs = toDateMs(state?.snoozed_until);
      if (snoozedUntilMs && snoozedUntilMs > nowMs) return null;
      return {
        ...nudge,
        state: state ? mapNudgeState(state) : undefined,
      };
    })
    .filter(Boolean) as NudgeItem[];

  for (const nudge of visible) {
    const state = states.get(nudge.id);
    await persistNudgeState({
      userId,
      nudgeId: nudge.id,
      existing: state,
      patch: {
        status: "active",
        last_shown_at: nowIso,
      },
    });
  }

  await materializeInboxNudges(userId, visible, states);

  return {
    nudges: visible,
    generatedAt: toIso(nowIso),
  };
}

export async function updateNudgeState(input: {
  userId: string;
  nudgeId: string;
  action: "dismiss" | "snooze" | "mark_acted";
  snoozeUntil?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const states = await fetchUserNudgeStates(input.userId);
  const existing = states.get(input.nudgeId);
  const patch: Record<string, unknown> = {
    status: "active",
  };

  if (input.action === "dismiss") {
    patch.status = "dismissed";
    patch.dismissed_at = nowIso;
  } else if (input.action === "mark_acted") {
    patch.status = "acted";
    patch.acted_at = nowIso;
  } else {
    const snoozeUntil =
      input.snoozeUntil && !Number.isNaN(new Date(input.snoozeUntil).getTime())
        ? new Date(input.snoozeUntil).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    patch.status = "snoozed";
    patch.snoozed_until = snoozeUntil;
  }

  await persistNudgeState({
    userId: input.userId,
    nudgeId: input.nudgeId,
    existing,
    patch,
  });

  return {
    id: input.nudgeId,
    action: input.action,
    state: {
      dismissedAt: String(patch.dismissed_at || ""),
      snoozedUntil: String(patch.snoozed_until || ""),
      actedAt: String(patch.acted_at || ""),
    },
  };
}

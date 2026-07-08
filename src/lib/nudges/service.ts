import "server-only";

import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  fetchDocsByIds,
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
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
  | "upcoming_recurring";

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

async function fetchUserNudgeStates(userId: string): Promise<Map<string, any>> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.userNudgeStates)
    .where("user_id", "==", userId)
    .limit(500)
    .get();
  const map = new Map<string, any>();
  for (const doc of snap.docs) {
    const row: any = { id: doc.id, ...(doc.data() || {}) };
    map.set(String(row.nudge_id || ""), row);
  }
  return map;
}

async function buildCandidateNudges(userId: string): Promise<NudgeItem[]> {
  const db = getAdminDb();
  const now = Date.now();

  const participantSnap = await db
    .collection(COLLECTIONS.expenseParticipants)
    .where("user_id", "==", userId)
    .get();

  const participantRows: any[] = participantSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));
  const expenseIds = uniqueStrings(
    participantRows.map((row: any) => String(row.expense_id || ""))
  );
  const expensesById = await fetchDocsByIds(COLLECTIONS.expenses, expenseIds);

  const nudges: NudgeItem[] = [];
  for (const participant of participantRows) {
    const expense = expensesById.get(String(participant.expense_id || ""));
    if (!expense || expense.is_deleted) continue;

    const status = normalizePaymentStatus(expense.payment_status, "unpaid");
    const expenseId = String(expense.id || participant.expense_id);
    const expenseDateMs = toDateMs(expense.date || expense.created_at || expense._created_at);
    const ageDays = diffDays(expenseDateMs, now);
    const owedAmount = toNum(participant.owed_amount);
    const paidAmount = toNum(participant.amount_paid);
    const pendingAmount = Math.max(0, owedAmount - paidAmount);

    if (pendingAmount > 0 && ageDays >= 10 && status !== "paid") {
      nudges.push({
        id: `pending_${expenseId}`,
        type: "pending_expense",
        severity: ageDays >= 20 ? "high" : "medium",
        title: `Pending for ${ageDays} days`,
        message: `You still have ${pendingAmount.toFixed(2)} pending for "${String(expense.description || "Expense")}".`,
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
        message: `"${String(expense.description || "Expense")}" is still partially paid after ${ageDays} days.`,
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
        message: `"${String(expense.description || "Expense")}" has been disputed for ${ageDays} days.`,
        actionLabel: "Open discussion",
        actionHref: `/expenses/edit/${expenseId}`,
        metadata: { expenseId, ageDays },
      });
    }
  }

  nudges.sort(
    (a, b) => Number(b.metadata?.ageDays || 0) - Number(a.metadata?.ageDays || 0)
  );

  const settlementSnap = await db
    .collection(COLLECTIONS.settlements)
    .where("from_user_id", "==", userId)
    .get();
  const settlementRows: any[] = settlementSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));

  const last90DaysMs = now - 90 * 24 * 60 * 60 * 1000;
  const recentSettlements = settlementRows.filter((row: any) =>
    toDateMs(row.date || row.created_at || row._created_at) >= last90DaysMs
  );
  if (recentSettlements.length >= 4) {
    const weekendCount = recentSettlements.filter((row) => {
      const day = new Date(toDateMs(row.date || row.created_at || row._created_at)).getDay();
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
    const usersMap = await fetchDocsByIds(COLLECTIONS.users, [topCounterparty[0]]);
    const topFriend = mapUser(usersMap.get(topCounterparty[0]));
    if (topFriend) {
      nudges.push({
        id: `followup_counterparty_${topFriend._id}`,
        type: "followup",
        severity: "low",
        title: "Frequent follow-up opportunity",
        message: `You settle often with ${topFriend.name}. A monthly check-in can close balances faster.`,
        actionLabel: "Open friend details",
        actionHref: `/friends/${topFriend._id}`,
        metadata: { friendId: topFriend._id, settlementCount: topCounterparty[1] },
      });
    }
  }

  const templatesSnap = await db
    .collection(COLLECTIONS.recurringExpenseTemplates)
    .where("owner_id", "==", userId)
    .where("status", "==", "active")
    .limit(200)
    .get();
  for (const doc of templatesSnap.docs) {
    const template: any = { id: doc.id, ...(doc.data() || {}) };
    const nextRunMs = toDateMs(template.next_run_at);
    if (!nextRunMs) continue;
    const daysUntil = Math.ceil((nextRunMs - now) / (1000 * 60 * 60 * 24));
    const title = String(template.name || template.expense_payload?.description || "Recurring expense");
    if (nextRunMs < now) {
      nudges.push({
        id: `missed_recurring_${template.id}`,
        type: "missed_recurring",
        severity: "high",
        title: "Recurring expense is overdue",
        message: `"${title}" has a missed run waiting to be recovered.`,
        actionLabel: "Review recurring expenses",
        actionHref: "/recurring-expenses",
        metadata: { recurringTemplateId: template.id, nextRunAt: toIso(template.next_run_at) },
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
        metadata: { recurringTemplateId: template.id, nextRunAt: toIso(template.next_run_at), daysUntil },
      });
    }
  }

  return nudges.slice(0, 12);
}

async function materializeInboxNudges(userId: string, nudges: NudgeItem[], states: Map<string, any>) {
  const now = Date.now();
  const nowIso = new Date().toISOString();
  const cooldownMs = 24 * 60 * 60 * 1000;
  const db = getAdminDb();

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

    await db.collection(COLLECTIONS.userNudgeStates).doc(nudgeStateId(userId, nudge.id)).set(
      {
        id: nudgeStateId(userId, nudge.id),
        user_id: userId,
        nudge_id: nudge.id,
        status: "active",
        last_inbox_at: nowIso,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export async function getSmartNudges(userId: string): Promise<{ nudges: NudgeItem[]; generatedAt: string }> {
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const [candidates, states] = await Promise.all([
    buildCandidateNudges(userId),
    fetchUserNudgeStates(userId),
  ]);

  const visible = candidates
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
    await db.collection(COLLECTIONS.userNudgeStates).doc(nudgeStateId(userId, nudge.id)).set(
      {
        id: nudgeStateId(userId, nudge.id),
        user_id: userId,
        nudge_id: nudge.id,
        status: "active",
        last_shown_at: nowIso,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    id: nudgeStateId(input.userId, input.nudgeId),
    user_id: input.userId,
    nudge_id: input.nudgeId,
    updated_at: nowIso,
    _updated_at: FieldValue.serverTimestamp(),
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

  await db
    .collection(COLLECTIONS.userNudgeStates)
    .doc(nudgeStateId(input.userId, input.nudgeId))
    .set(patch, { merge: true });

  return {
    id: input.nudgeId,
    action: input.action,
    state: {
      dismissedAt: patch.dismissed_at || "",
      snoozedUntil: patch.snoozed_until || "",
      actedAt: patch.acted_at || "",
    },
  };
}

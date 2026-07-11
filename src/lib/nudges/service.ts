import "server-only";

import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/firestore/route-helpers";
import { logActivity } from "@/lib/activity-logger";
import { normalizePaymentStatus } from "@/lib/expenses/payment-status";

async function fetchDocsByIds(collection: string, ids: string[]): Promise<Map<string, any>> {
  const db = getAdminDb();
  const map = new Map<string, any>();
  if (!ids || ids.length === 0) return map;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    chunks.push(uniqueIds.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    const snap = await db.collection(collection).where("id", "in", chunk).get();
    for (const doc of snap.docs) {
      map.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }
  return map;
}

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

  const participantRows: any[] = participantSnap.docs.map((doc: any) => ({
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
  const settlementRows: any[] = settlementSnap.docs.map((doc: any) => ({
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

/**
 * Finds recurring expense templates whose last run produced an unsettled debt.
 * Generates a high-priority nudge with the payer's name and a direct action.
 */
async function buildRecurringSettlementNudges(userId: string): Promise<NudgeItem[]> {
  const db = getAdminDb();
  const now = Date.now();
  const nudges: NudgeItem[] = [];

  // Fetch active templates owned by this user
  const templatesSnap = await db
    .collection(COLLECTIONS.recurringExpenseTemplates)
    .where("owner_id", "==", userId)
    .where("status", "==", "active")
    .limit(50)
    .get();

  if (templatesSnap.empty) return nudges;

  for (const tDoc of templatesSnap.docs) {
    const template: any = { id: tDoc.id, ...(tDoc.data() || {}) };
    const templateId = template.id;
    const templateName = String(template.name || template.expense_payload?.description || "Recurring expense");

    // Fetch the most recent run for this template
    const runsSnap = await db
      .collection(COLLECTIONS.recurring_runs)
      .where("template_id", "==", templateId)
      .orderBy("run_at", "desc")
      .limit(1)
      .get();

    if (runsSnap.empty) continue;
    const lastRun: any = { id: runsSnap.docs[0].id, ...(runsSnap.docs[0].data() || {}) };
    const runExpenseId = String(lastRun.expense_id || "");
    if (!runExpenseId) continue;

    // Check if expense participants still have unpaid amounts
    const participantsSnap = await db
      .collection(COLLECTIONS.expense_participants)
      .where("expense_id", "==", runExpenseId)
      .get();

    let totalUnpaid = 0;
    const unpaidUserIds: string[] = [];
    for (const pDoc of participantsSnap.docs) {
      const p: any = { id: pDoc.id, ...(pDoc.data() || {}) };
      const owed = toNum(p.owed_amount);
      const paid = toNum(p.amount_paid);
      const pending = Math.max(0, owed - paid);
      if (pending > 0.01 && String(p.user_id || "") !== userId) {
        totalUnpaid += pending;
        unpaidUserIds.push(String(p.user_id || ""));
      }
    }

    if (totalUnpaid <= 0.01 || unpaidUserIds.length === 0) continue;

    // Get the run age in days
    const runAtMs = lastRun.run_at?.toDate ? lastRun.run_at.toDate().getTime() : new Date(lastRun.run_at || 0).getTime();
    const ageDays = Math.floor((now - runAtMs) / (1000 * 60 * 60 * 24));
    if (ageDays < 3) continue; // Give a 3-day grace period before nudging

    // Fetch debtor names
    const usersMap = await fetchDocsByIds(COLLECTIONS.users, unpaidUserIds);
    const debtorNames = unpaidUserIds
      .map((uid) => {
        const u = usersMap.get(uid);
        return u ? String(u.name || "") : null;
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

/**
 * Detects repeated expense patterns with specific friends on the same day-of-month.
 * E.g. "You usually add utilities with Rahul around the 5th"
 */
async function buildPatternNudges(userId: string): Promise<NudgeItem[]> {
  const db = getAdminDb();
  const now = new Date();
  const todayDom = now.getDate(); // day-of-month (1–31)
  const nudges: NudgeItem[] = [];

  // Fetch recent expenses where this user was the creator (last 6 months)
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const expSnap = await db
    .collection(COLLECTIONS.expenses)
    .where("created_by", "==", userId)
    .where("is_deleted", "==", false)
    .orderBy("date", "desc")
    .limit(120)
    .get();

  if (expSnap.empty) return nudges;

  const expenses: any[] = expSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));

  // Group by (group_id or friend pattern) + category
  type PatternKey = string;
  const patternMap = new Map<PatternKey, { dates: number[]; category: string; groupId?: string }>();

  for (const exp of expenses) {
    const dateVal = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date || 0);
    if (isNaN(dateVal.getTime())) continue;
    const dom = dateVal.getDate();
    const groupId = String(exp.group_id || "");
    const category = String(exp.category || "other");
    const key: PatternKey = `${groupId}_${category}`;
    if (!patternMap.has(key)) {
      patternMap.set(key, { dates: [], category, groupId: groupId || undefined });
    }
    patternMap.get(key)!.dates.push(dom);
  }

  // Find keys with ≥3 occurrences within ±4 days of today
  const WINDOW = 4;
  for (const [key, pattern] of patternMap.entries()) {
    if (pattern.dates.length < 3) continue;
    const nearToday = pattern.dates.filter(
      (dom) => Math.abs(dom - todayDom) <= WINDOW || Math.abs(dom - todayDom + 31) <= WINDOW
    );
    if (nearToday.length < 3) continue;

    // Avoid showing this nudge if one was shown recently (handled by nudge state system)
    const nudgeId = `pattern_${key}`;
    const categoryLabel =
      pattern.category === "utilities" ? "utilities" :
      pattern.category === "food" ? "food" :
      pattern.category === "rent" ? "rent" :
      pattern.category;

    let contextStr = "";
    if (pattern.groupId) {
      // Look up group name
      try {
        const gDoc = await db.collection(COLLECTIONS.groups).doc(pattern.groupId).get();
        if (gDoc.exists) {
          const g: any = gDoc.data() || {};
          contextStr = ` with "${String(g.name || "your group")}"`;
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

    if (nudges.length >= 2) break; // max 2 pattern nudges
  }

  return nudges;
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

    // 🔔 Send a push notification for high/medium severity nudges
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

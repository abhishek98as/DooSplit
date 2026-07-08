import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { firestore, https, logger, scheduler } from "firebase-functions/v2";

initializeApp();

const FIRESTORE_DATABASE_ID = "doosplit";
const db = getFirestore(FIRESTORE_DATABASE_ID);
const messaging = getMessaging();
const REGION = "asia-south1";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    output.push(values.slice(i, i + size));
  }
  return output;
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizePayloadData(data: Record<string, unknown> = {}): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
}

async function getUserFcmTokens(userIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const refs = unique(userIds).map((userId) => db.collection("users").doc(userId));

  for (const refChunk of chunk(refs, 200)) {
    const docs = await db.getAll(...refChunk);
    for (const doc of docs) {
      if (!doc.exists) {
        continue;
      }
      const row = doc.data() || {};
      if (row.push_notifications_enabled === false) {
        continue;
      }
      const tokens = Array.isArray(row.fcm_tokens)
        ? unique(row.fcm_tokens.map((token: unknown) => String(token)))
        : [];
      if (tokens.length > 0) {
        result.set(doc.id, tokens);
      }
    }
  }

  return result;
}

async function removeInvalidTokens(entries: Array<{ userId: string; token: string }>) {
  if (entries.length === 0) {
    return;
  }

  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.userId) || [];
    list.push(entry.token);
    grouped.set(entry.userId, list);
  }

  await Promise.all(
    Array.from(grouped.entries()).map(async ([userId, tokens]) => {
      const uniqueTokens = unique(tokens);
      if (uniqueTokens.length === 0) {
        return;
      }
      await db.collection("users").doc(userId).set(
        {
          fcm_tokens: FieldValue.arrayRemove(...uniqueTokens),
          updated_at: new Date().toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

async function sendPushToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    url?: string;
    data?: Record<string, unknown>;
  }
): Promise<{ successCount: number; failureCount: number; tokenCount: number }> {
  const tokenMap = await getUserFcmTokens(userIds);
  const tokenOwners: Array<{ token: string; userId: string }> = [];
  for (const [userId, tokens] of tokenMap.entries()) {
    for (const token of tokens) {
      tokenOwners.push({ token, userId });
    }
  }

  if (tokenOwners.length === 0) {
    return { successCount: 0, failureCount: 0, tokenCount: 0 };
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: Array<{ userId: string; token: string }> = [];

  for (const ownerChunk of chunk(tokenOwners, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: ownerChunk.map((owner) => owner.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: normalizePayloadData(payload.data || {}),
      webpush: {
        fcmOptions: payload.url ? { link: payload.url } : undefined,
        notification: {
          title: payload.title,
          body: payload.body,
          icon: "/api/pwa/icon?size=192",
        },
      },
    });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((item, index) => {
      if (item.success) {
        return;
      }
      const code = item.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalidTokens.push({
          userId: ownerChunk[index].userId,
          token: ownerChunk[index].token,
        });
      }
    });
  }

  await removeInvalidTokens(invalidTokens);
  return { successCount, failureCount, tokenCount: tokenOwners.length };
}

async function createNotificationDocs(
  userIds: string[],
  payload: { type: string; message: string; data?: Record<string, unknown> }
) {
  const now = new Date().toISOString();
  await Promise.all(
    unique(userIds).map(async (userId) => {
      const ref = db.collection("notifications").doc();
      await ref.set({
        id: ref.id,
        user_id: userId,
        type: payload.type,
        message: payload.message,
        data: payload.data || {},
        is_read: false,
        created_at: now,
        updated_at: now,
        _created_at: FieldValue.serverTimestamp(),
        _updated_at: FieldValue.serverTimestamp(),
      });
    })
  );
}

async function computeUserNetBalance(userId: string): Promise<number> {
  const participantsSnap = await db
    .collection("expense_participants")
    .where("user_id", "==", userId)
    .get();

  const expenseIds = unique(
    participantsSnap.docs.map((doc) => String(doc.data().expense_id || ""))
  );

  const validExpenseIds = new Set<string>();
  for (const idChunk of chunk(expenseIds, 200)) {
    const refs = idChunk.map((expenseId) => db.collection("expenses").doc(expenseId));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) {
        continue;
      }
      const expense = doc.data() || {};
      if (!expense.is_deleted) {
        validExpenseIds.add(String(expense.id || doc.id));
      }
    }
  }

  let balance = 0;
  for (const participantDoc of participantsSnap.docs) {
    const row = participantDoc.data() || {};
    if (!validExpenseIds.has(String(row.expense_id || ""))) {
      continue;
    }
    balance += Number(row.paid_amount || 0) - Number(row.owed_amount || 0);
  }

  const [fromSnap, toSnap] = await Promise.all([
    db.collection("settlements").where("from_user_id", "==", userId).get(),
    db.collection("settlements").where("to_user_id", "==", userId).get(),
  ]);

  fromSnap.docs.forEach((doc) => {
    balance -= Number(doc.data().amount || 0);
  });
  toSnap.docs.forEach((doc) => {
    balance += Number(doc.data().amount || 0);
  });

  return Number(balance.toFixed(2));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function extractUserId(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return extractUserId(row.userId || row.id || row._id || row.uid);
  }
  return "";
}

function splitRecurringExpense(payload: Record<string, unknown>, ownerId: string) {
  const amount = Number(payload.amount || 0);
  const paidBy = extractUserId(payload.paidBy) || ownerId;
  const rawParticipants = Array.isArray(payload.participants) ? payload.participants : [];
  const participantIds = unique([
    paidBy,
    ...rawParticipants.map((participant) =>
      extractUserId((participant as Record<string, unknown>)?.userId || participant)
    ),
  ]);
  const splitMethod = String(payload.splitMethod || "equally");

  if (participantIds.length === 0 || amount <= 0) {
    throw new Error("Invalid recurring expense payload");
  }

  if (splitMethod === "exact") {
    const rows = rawParticipants
      .map((participant) => {
        const row = participant as Record<string, unknown>;
        return {
          userId: extractUserId(row.userId || participant),
          owedAmount: Number(row.exactAmount || row.owedAmount || 0),
        };
      })
      .filter((row) => row.userId);
    if (!rows.some((row) => row.userId === paidBy)) {
      rows.push({ userId: paidBy, owedAmount: 0 });
    }
    return rows.map((row) => ({
      user_id: row.userId,
      paid_amount: row.userId === paidBy ? amount : 0,
      owed_amount: round2(row.owedAmount),
      is_settled: false,
    }));
  }

  if (splitMethod === "percentage") {
    let allocated = 0;
    return rawParticipants
      .map((participant, index) => {
        const row = participant as Record<string, unknown>;
        const userId = extractUserId(row.userId || participant);
        const percentage = Number(row.percentage || 0);
        const owed =
          index === rawParticipants.length - 1
            ? round2(amount - allocated)
            : round2((amount * percentage) / 100);
        allocated = round2(allocated + owed);
        return {
          user_id: userId,
          paid_amount: userId === paidBy ? amount : 0,
          owed_amount: owed,
          is_settled: false,
        };
      })
      .filter((row) => row.user_id);
  }

  if (splitMethod === "shares") {
    const rows = rawParticipants
      .map((participant) => {
        const row = participant as Record<string, unknown>;
        return {
          userId: extractUserId(row.userId || participant),
          shares: Number(row.shares || 1),
        };
      })
      .filter((row) => row.userId);
    const totalShares = rows.reduce((sum, row) => sum + row.shares, 0) || rows.length;
    let allocated = 0;
    return rows.map((row, index) => {
      const owed =
        index === rows.length - 1
          ? round2(amount - allocated)
          : round2((amount * row.shares) / totalShares);
      allocated = round2(allocated + owed);
      return {
        user_id: row.userId,
        paid_amount: row.userId === paidBy ? amount : 0,
        owed_amount: owed,
        is_settled: false,
      };
    });
  }

  const share = round2(amount / participantIds.length);
  const remainder = round2(amount - share * participantIds.length);
  return participantIds.map((userId, index) => ({
    user_id: userId,
    paid_amount: userId === paidBy ? amount : 0,
    owed_amount: index === 0 ? round2(share + remainder) : share,
    is_settled: false,
  }));
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addRecurringInterval(
  value: Date,
  frequency: string,
  intervalValue: number,
  dayOfMonth?: number | null
): Date {
  const interval = Math.max(1, Math.floor(Number(intervalValue || 1)));
  const from = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
  if (frequency === "weekly") {
    from.setUTCDate(from.getUTCDate() + 7 * interval);
    return from;
  }
  if (frequency === "yearly") {
    const year = from.getUTCFullYear() + interval;
    const month = from.getUTCMonth();
    const day = Math.min(Number(dayOfMonth || from.getUTCDate()), daysInUtcMonth(year, month));
    return new Date(Date.UTC(year, month, day));
  }
  const totalMonths = from.getUTCMonth() + interval;
  const year = from.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const day = Math.min(Number(dayOfMonth || from.getUTCDate()), daysInUtcMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

function recurringRunKey(templateId: string, occurrenceDate: Date): string {
  return `${templateId}_${occurrenceDate.toISOString().slice(0, 10)}`;
}

async function createRecurringExpenseRun(templateDoc: any) {
  const template = templateDoc.data() || {};
  const templateId = String(template.id || templateDoc.id);
  const ownerId = String(template.owner_id || "");
  const nextRunAt = toDate(template.next_run_at);
  if (!ownerId || !nextRunAt) {
    return { status: "skipped" };
  }

  const occurrenceDate = new Date(
    Date.UTC(nextRunAt.getUTCFullYear(), nextRunAt.getUTCMonth(), nextRunAt.getUTCDate())
  );
  const runId = recurringRunKey(templateId, occurrenceDate);
  const runRef = db.collection("recurring_expense_runs").doc(runId);
  const nextRun = addRecurringInterval(
    occurrenceDate,
    String(template.frequency || "monthly"),
    Number(template.interval || 1),
    template.day_of_month === undefined || template.day_of_month === null
      ? null
      : Number(template.day_of_month)
  );

  if ((await runRef.get()).exists) {
    await templateDoc.ref.set(
      {
        last_run_at: occurrenceDate.toISOString(),
        next_run_at: nextRun.toISOString(),
        updated_at: new Date().toISOString(),
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { status: "duplicate" };
  }

  const payload = (template.expense_payload || {}) as Record<string, unknown>;
  const expenseRef = db.collection("expenses").doc();
  const participantRows = splitRecurringExpense(payload, ownerId);
  const batch = db.batch();
  const nowIso = new Date().toISOString();

  batch.set(runRef, {
    id: runId,
    template_id: templateId,
    owner_id: ownerId,
    occurrence_date: occurrenceDate.toISOString(),
    status: "created",
    expense_id: expenseRef.id,
    created_at: nowIso,
    updated_at: nowIso,
    _created_at: FieldValue.serverTimestamp(),
    _updated_at: FieldValue.serverTimestamp(),
  });
  batch.set(expenseRef, {
    id: expenseRef.id,
    amount: Number(payload.amount || 0),
    description: String(payload.description || template.name || "Recurring expense"),
    category: String(payload.category || "other"),
    date: occurrenceDate.toISOString(),
    currency: String(payload.currency || "INR"),
    created_by: ownerId,
    group_id: payload.groupId || null,
    images: Array.isArray(payload.images) ? payload.images : [],
    notes: payload.notes || "",
    is_deleted: false,
    split_method: String(payload.splitMethod || "equally"),
    payment_status: "unpaid",
    payment_status_updated_at: nowIso,
    payment_status_updated_by: ownerId,
    recurring_template_id: templateId,
    recurring_run_id: runId,
    recurrence_occurrence_date: occurrenceDate.toISOString(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  for (const participant of participantRows) {
    const participantRef = db.collection("expense_participants").doc();
    batch.set(participantRef, {
      id: participantRef.id,
      expense_id: expenseRef.id,
      ...participant,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  const endDate = toDate(template.end_date);
  batch.set(
    templateDoc.ref,
    {
      last_run_at: occurrenceDate.toISOString(),
      next_run_at: nextRun.toISOString(),
      status: endDate && nextRun > endDate ? "ended" : "active",
      updated_at: nowIso,
      _updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();

  const participantIds = unique(participantRows.map((row) => String(row.user_id || "")));
  await createNotificationDocs(
    participantIds.filter((id) => id !== ownerId),
    {
      type: "recurring_expense_created",
      message: `Recurring expense "${String(payload.description || template.name || "Expense")}" was added`,
      data: { expenseId: expenseRef.id, recurringTemplateId: templateId, runId },
    }
  );

  return { status: "created", expenseId: expenseRef.id };
}

function mapUserName(snapshot: QueryDocumentSnapshot<DocumentData>): string {
  return String(snapshot.data().name || "").trim() || "Someone";
}

export const expenseActivityPush = firestore.onDocumentCreated(
  { document: "expenses/{expenseId}", region: REGION, database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const expense = snapshot.data() || {};
    const expenseId = snapshot.id;
    const actorId = String(expense.created_by || "");
    const description = String(expense.description || "an expense");
    const amount = Number(expense.amount || 0);
    const currency = String(expense.currency || "INR");

    if (!actorId) {
      return;
    }

    const [actorDoc, participantSnap] = await Promise.all([
      db.collection("users").doc(actorId).get(),
      db.collection("expense_participants").where("expense_id", "==", expenseId).get(),
    ]);

    const actorName = actorDoc.exists
      ? String(actorDoc.data()?.name || "Someone")
      : "Someone";
    const participantIds = unique(
      participantSnap.docs
        .map((doc) => String(doc.data().user_id || ""))
        .filter((userId) => userId !== actorId)
    );

    if (participantIds.length === 0) {
      return;
    }

    const message = `${actorName} added "${description}" (${currency} ${amount.toFixed(2)})`;
    await createNotificationDocs(participantIds, {
      type: "expense_created",
      message,
      data: { expenseId, actorId },
    });

    const pushResult = await sendPushToUsers(participantIds, {
      title: "New Expense Added",
      body: message,
      url: "/expenses",
      data: { type: "expense_created", expenseId, actorId },
    });

    logger.info("expenseActivityPush sent", {
      expenseId,
      participants: participantIds.length,
      ...pushResult,
    });
  }
);

export const settlementActivityPush = firestore.onDocumentCreated(
  { document: "settlements/{settlementId}", region: REGION, database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const settlement = snapshot.data() || {};
    const settlementId = snapshot.id;
    const fromUserId = String(settlement.from_user_id || "");
    const toUserId = String(settlement.to_user_id || "");
    const amount = Number(settlement.amount || 0);
    const currency = String(settlement.currency || "INR");

    if (!fromUserId || !toUserId) {
      return;
    }

    const [fromUserDoc, toUserDoc] = await Promise.all([
      db.collection("users").doc(fromUserId).get(),
      db.collection("users").doc(toUserId).get(),
    ]);

    const fromName = fromUserDoc.exists
      ? String(fromUserDoc.data()?.name || "Someone")
      : "Someone";
    const toName = toUserDoc.exists ? String(toUserDoc.data()?.name || "Someone") : "Someone";
    const message = `${fromName} recorded a settlement of ${currency} ${amount.toFixed(
      2
    )} with ${toName}`;

    await createNotificationDocs([toUserId], {
      type: "settlement_recorded",
      message,
      data: { settlementId, fromUserId, toUserId },
    });

    const pushResult = await sendPushToUsers([toUserId], {
      title: "Settlement Recorded",
      body: message,
      url: "/settlements",
      data: { type: "settlement_recorded", settlementId, fromUserId, toUserId },
    });

    logger.info("settlementActivityPush sent", { settlementId, ...pushResult });
  }
);

export const sendDuePaymentReminders = scheduler.onSchedule(
  { schedule: "every 60 minutes", timeZone: "Asia/Kolkata", region: REGION },
  async () => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const remindersSnap = await db
      .collection("payment_reminders")
      .where("status", "==", "sent")
      .get();

    let notifiedCount = 0;
    for (const doc of remindersSnap.docs) {
      const reminder = doc.data() || {};
      const toUserId = String(reminder.to_user_id || "");
      const fromUserId = String(reminder.from_user_id || "");
      const sentAt = toDate(reminder.sent_at);
      const lastPushAt = toDate(reminder.last_push_at);

      if (!toUserId || !fromUserId || !sentAt) {
        continue;
      }
      if (sentAt > twentyFourHoursAgo) {
        continue;
      }
      if (lastPushAt && lastPushAt > twelveHoursAgo) {
        continue;
      }

      const amount = Number(reminder.amount || 0);
      const currency = String(reminder.currency || "INR");
      const fromUserDoc = await db.collection("users").doc(fromUserId).get();
      const fromUserName = fromUserDoc.exists
        ? String(fromUserDoc.data()?.name || "A friend")
        : "A friend";

      const message = `${fromUserName} reminded you about ${currency} ${amount.toFixed(2)}`;
      await createNotificationDocs([toUserId], {
        type: "payment_reminder",
        message,
        data: { reminderId: doc.id, fromUserId, amount, currency },
      });

      await sendPushToUsers([toUserId], {
        title: "Payment Reminder",
        body: message,
        url: "/settlements",
        data: { type: "payment_reminder", reminderId: doc.id, fromUserId, amount, currency },
      });

      await doc.ref.set(
        {
          last_push_at: now.toISOString(),
          updated_at: now.toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      notifiedCount += 1;
    }

    logger.info("sendDuePaymentReminders completed", { notifiedCount });
  }
);

export const runDueRecurringExpenses = scheduler.onSchedule(
  { schedule: "every 60 minutes", timeZone: "Asia/Kolkata", region: REGION },
  async () => {
    const nowIso = new Date().toISOString();
    const dueSnap = await db
      .collection("recurring_expense_templates")
      .where("status", "==", "active")
      .where("next_run_at", "<=", nowIso)
      .orderBy("next_run_at", "asc")
      .limit(50)
      .get();

    let createdCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const templateDoc of dueSnap.docs) {
      let runsForTemplate = 0;
      while (runsForTemplate < 12) {
        const currentDoc = await templateDoc.ref.get();
        if (!currentDoc.exists) break;
        const current = currentDoc.data() || {};
        if (current.status !== "active") break;
        const nextRunAt = toDate(current.next_run_at);
        if (!nextRunAt || nextRunAt > new Date()) break;

        try {
          const result = await createRecurringExpenseRun(currentDoc);
          if (result.status === "duplicate") {
            duplicateCount += 1;
          } else if (result.status === "created") {
            createdCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          logger.error("runDueRecurringExpenses failed for template", {
            templateId: templateDoc.id,
            error,
          });
          break;
        }

        runsForTemplate += 1;
      }
    }

    logger.info("runDueRecurringExpenses completed", {
      checked: dueSnap.size,
      createdCount,
      duplicateCount,
      failedCount,
    });
  }
);

export const nightlyBalanceRecalculation = scheduler.onSchedule(
  { schedule: "every day 01:00", timeZone: "Asia/Kolkata", region: REGION },
  async () => {
    const usersSnap = await db.collection("users").where("is_active", "!=", false).get();
    const snapshotDate = new Date().toISOString().slice(0, 10);
    let processedUsers = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const netBalance = await computeUserNetBalance(userId);
      const snapshotId = `${snapshotDate}_${userId}`;
      await db.collection("balance_snapshots").doc(snapshotId).set({
        id: snapshotId,
        user_id: userId,
        snapshot_date: snapshotDate,
        net_balance: netBalance,
        created_at: new Date().toISOString(),
        _created_at: FieldValue.serverTimestamp(),
      });
      processedUsers += 1;
    }

    logger.info("nightlyBalanceRecalculation completed", { processedUsers });
  }
);

export const cleanupExpiredInvitations = scheduler.onSchedule(
  { schedule: "every day 02:00", timeZone: "Asia/Kolkata", region: REGION },
  async () => {
    const now = new Date();
    const pendingInvites = await db
      .collection("invitations")
      .where("status", "==", "pending")
      .get();

    let expiredCount = 0;
    const batch = db.batch();
    for (const inviteDoc of pendingInvites.docs) {
      const invite = inviteDoc.data() || {};
      const expiresAt = toDate(invite.expires_at);
      if (!expiresAt || expiresAt > now) {
        continue;
      }

      batch.set(
        inviteDoc.ref,
        {
          status: "expired",
          updated_at: now.toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      expiredCount += 1;
    }

    if (expiredCount > 0) {
      await batch.commit();
    }

    logger.info("cleanupExpiredInvitations completed", { expiredCount });
  }
);

export const paymentStatusWebhook = https.onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env.WEBHOOK_SECRET || "";
  const providedSecret = String(req.headers["x-doosplit-webhook-secret"] || "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const eventType = String(body.type || "");
  const nowIso = new Date().toISOString();

  try {
    if (eventType === "settlement.paid") {
      const settlementId = String(body.settlementId || "");
      if (!settlementId) {
        res.status(400).json({ error: "settlementId is required" });
        return;
      }

      await db.collection("settlements").doc(settlementId).set(
        {
          payment_status: "paid",
          paid_at: nowIso,
          webhook_updated_at: nowIso,
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.status(200).json({ ok: true, updated: "settlement" });
      return;
    }

    if (eventType === "reminder.paid") {
      const reminderId = String(body.reminderId || "");
      if (!reminderId) {
        res.status(400).json({ error: "reminderId is required" });
        return;
      }

      await db.collection("payment_reminders").doc(reminderId).set(
        {
          status: "paid",
          paid_at: nowIso,
          updated_at: nowIso,
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.status(200).json({ ok: true, updated: "payment_reminder" });
      return;
    }

    res.status(202).json({ ok: true, ignored: true, eventType });
  } catch (error: any) {
    logger.error("paymentStatusWebhook failed", error);
    res.status(500).json({ error: error?.message || "Webhook processing failed" });
  }
});

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

const db = getFirestore();
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
          icon: "/logo.webp",
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

function mapUserName(snapshot: QueryDocumentSnapshot<DocumentData>): string {
  return String(snapshot.data().name || "").trim() || "Someone";
}

export const expenseActivityPush = firestore.onDocumentCreated(
  { document: "expenses/{expenseId}", region: REGION },
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
  { document: "settlements/{settlementId}", region: REGION },
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

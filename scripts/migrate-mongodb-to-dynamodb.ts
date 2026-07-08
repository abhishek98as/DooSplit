/**
 * Migrates all MongoDB data to DynamoDB.
 * Run with: npx tsx scripts/migrate-mongodb-to-dynamodb.ts [--dry-run]
 *
 * Features:
 * - Resumable: tracks progress per collection in doosplit_migration table
 * - Dry-run mode: prints counts without writing to DynamoDB
 * - Idempotent: can be re-run safely
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import mongoose from "mongoose";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const DRY_RUN = process.argv.includes("--dry-run");
const REGION = process.env.AWS_REGION ?? "eu-central-1";
const TABLE = process.env.DYNAMODB_TABLE ?? "doosplit";
const MIGRATION_TABLE = process.env.DYNAMODB_MIGRATION_TABLE ?? "doosplit_migration";

// ── AWS Client ────────────────────────────────────────────────────────────────

const rawClient = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const dynamo = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

// ── MongoDB Connection ────────────────────────────────────────────────────────

async function connectMongo(): Promise<void> {
  const rawPassword = process.env.MONGODB_PASSWORD ?? "";
  // URL-encode the password to handle special characters like @ # %
  const encodedPassword = encodeURIComponent(rawPassword);
  const uri = (process.env.MONGODB_URI ?? "").replace("<db_password>", encodedPassword);
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME ?? "doosplit" });
  console.log("✓ MongoDB connected");
}

// ── Migration State ───────────────────────────────────────────────────────────

async function getMigrationState(collection: string): Promise<{ count: number; status: string }> {
  const res = await dynamo.send(
    new GetCommand({ TableName: MIGRATION_TABLE, Key: { PK: `COLLECTION#${collection}`, SK: "STATE" } })
  );
  return (res.Item as any) ?? { count: 0, status: "pending" };
}

async function saveMigrationState(
  collection: string,
  count: number,
  status: "running" | "completed" | "error",
  error?: string
): Promise<void> {
  if (DRY_RUN) return;
  await dynamo.send(
    new PutCommand({
      TableName: MIGRATION_TABLE,
      Item: {
        PK: `COLLECTION#${collection}`,
        SK: "STATE",
        count,
        status,
        error: error ?? null,
        updated_at: new Date().toISOString(),
      },
    })
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(v: any): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  return new Date().toISOString();
}

function str(v: any, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

function num(v: any): number {
  return Number(v || 0);
}

function bool(v: any): boolean {
  return Boolean(v);
}

async function putItem(item: Record<string, unknown>): Promise<void> {
  if (DRY_RUN) return;
  await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Individual Collection Migrations ─────────────────────────────────────────

async function migrateUsers(): Promise<number> {
  const { GSI1PK, GSI1SK, PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("users");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const email = str(doc.email || doc.email_normalized, "").toLowerCase();
    await putItem({
      PK: PK.user(id),
      SK: SK.profile,
      entityType: "user",
      GSI1PK: GSI1PK.email(email),
      GSI1SK: GSI1SK.user(id),
      id,
      email,
      email_normalized: str(doc.email_normalized, email),
      name: str(doc.name, "Unknown"),
      name_normalized: str(doc.name_normalized, str(doc.name, "").toLowerCase()),
      display_name: str(doc.display_name),
      photo_url: str(doc.photo_url || doc.profile_picture),
      phone_number: str(doc.phone_number),
      default_currency: str(doc.default_currency, "INR"),
      is_active: bool(doc.is_active !== false),
      is_dummy: bool(doc.is_dummy),
      merged_into: str(doc.merged_into),
      firebase_uid: str(doc.firebase_uid),
      preferences: doc.preferences ?? {},
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }
  return count;
}

async function migrateFriendships(): Promise<number> {
  const { GSI1PK, GSI1SK, PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("friendships");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const userId = str(doc.user_id);
    const friendId = str(doc.friend_id);
    if (!userId || !friendId) continue;

    const base = {
      entityType: "friendship",
      id,
      user_id: userId,
      friend_id: friendId,
      status: str(doc.status, "pending"),
      requested_by: str(doc.requested_by, userId),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    };

    // Forward direction
    await putItem({
      PK: PK.user(userId),
      SK: SK.friend(friendId),
      GSI1PK: GSI1PK.friendOf(friendId),
      GSI1SK: GSI1SK.user(userId),
      ...base,
    });
    // Reverse direction
    await putItem({
      PK: PK.user(friendId),
      SK: SK.friend(userId),
      GSI1PK: GSI1PK.friendOf(userId),
      GSI1SK: GSI1SK.user(friendId),
      ...base,
      user_id: friendId,
      friend_id: userId,
    });
    count++;
  }
  return count;
}

async function migrateGroups(): Promise<number> {
  const { PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("groups");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    await putItem({
      PK: PK.group(id),
      SK: SK.meta,
      entityType: "group",
      id,
      name: str(doc.name, "Untitled Group"),
      description: str(doc.description),
      created_by: str(doc.created_by || doc.createdBy),
      currency: str(doc.currency, "INR"),
      is_active: bool(doc.is_active !== false),
      member_count: num(doc.member_count),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }
  return count;
}

async function migrateGroupMembers(): Promise<number> {
  const { GSI1PK, GSI1SK, PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("groupmembers");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const groupId = str(doc.group_id || doc.groupId);
    const userId = str(doc.user_id || doc.userId);
    if (!groupId || !userId) continue;

    await putItem({
      PK: PK.group(groupId),
      SK: SK.member(userId),
      entityType: "group_member",
      GSI1PK: GSI1PK.member(userId),
      GSI1SK: GSI1SK.group(groupId),
      group_id: groupId,
      user_id: userId,
      role: str(doc.role, "member"),
      status: str(doc.status, "active"),
      joined_at: toIso(doc.joined_at || doc.joinedAt || doc.created_at),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }
  return count;
}

async function migrateExpenses(): Promise<number> {
  const { GSI1PK, GSI1SK, PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const expCol = mongoose.connection.db!.collection("expenses");
  const partCol = mongoose.connection.db!.collection("expenseparticipants");
  const docs = await expCol.find({}).toArray();
  let count = 0;

  for (const batch of chunk(docs, 50)) {
    const expenseIds = batch.map((d) => str(d._id));
    const participants = await partCol.find({ expense_id: { $in: expenseIds } }).toArray();
    const partByExpense = new Map<string, any[]>();
    for (const p of participants) {
      const eid = str(p.expense_id);
      const list = partByExpense.get(eid) || [];
      list.push(p);
      partByExpense.set(eid, list);
    }

    for (const doc of batch) {
      const id = str(doc._id);
      const date = toIso(doc.date || doc.created_at);
      const ts = toSortableTs(date);

      // Expense META
      await putItem({
        PK: PK.expense(id),
        SK: SK.meta,
        entityType: "expense",
        GSI1PK: GSI1PK.expOwner(str(doc.created_by || doc.createdBy)),
        GSI1SK: GSI1SK.expense(ts, id),
        id,
        group_id: str(doc.group_id || doc.groupId),
        created_by: str(doc.created_by || doc.createdBy),
        description: str(doc.description),
        amount: num(doc.amount),
        currency: str(doc.currency, "INR"),
        category: str(doc.category, "other"),
        date,
        time: str(doc.time),
        receipt_images: Array.isArray(doc.receipt_images) ? doc.receipt_images : [],
        notes: str(doc.notes),
        split_type: str(doc.split_type || doc.splitMethod, "equally"),
        is_deleted: bool(doc.is_deleted),
        is_settled: bool(doc.is_settled),
        created_at: toIso(doc.created_at || doc.createdAt),
        updated_at: toIso(doc.updated_at || doc.updatedAt),
      });

      // Expense participants
      const expParticipants = partByExpense.get(id) || [];
      for (const p of expParticipants) {
        const userId = str(p.user_id);
        if (!userId) continue;

        await putItem({
          PK: PK.expense(id),
          SK: SK.part(userId),
          entityType: "expense_participant",
          GSI1PK: GSI1PK.expPart(userId),
          GSI1SK: GSI1SK.expense(ts, id),
          expense_id: id,
          user_id: userId,
          amount_owed: num(p.amount_owed),
          amount_paid: num(p.amount_paid),
          split_type: str(p.split_type),
          is_excluded: bool(p.is_excluded),
          is_settled: bool(p.is_settled),
          expense_date: date,
          expense_group_id: str(doc.group_id || doc.groupId),
          created_at: toIso(p.created_at || p.createdAt || doc.created_at),
          updated_at: toIso(p.updated_at || p.updatedAt || doc.updated_at),
        });

        // User expense feed fan-out
        await putItem({
          PK: PK.user(userId),
          SK: SK.expense(ts, id),
          entityType: "expense_feed",
          expense_id: id,
          user_id: userId,
          amount_owed: num(p.amount_owed),
          amount_paid: num(p.amount_paid),
          is_settled: bool(p.is_settled),
          is_excluded: bool(p.is_excluded),
          group_id: str(doc.group_id || doc.groupId),
          created_by: str(doc.created_by || doc.createdBy),
          description: str(doc.description),
          amount: num(doc.amount),
          currency: str(doc.currency, "INR"),
          category: str(doc.category, "other"),
          date,
          split_type: str(doc.split_type || doc.splitMethod, "equally"),
          is_deleted: bool(doc.is_deleted),
          created_at: toIso(doc.created_at || doc.createdAt),
          updated_at: toIso(doc.updated_at || doc.updatedAt),
        });
      }

      // Group expense feed fan-out
      const groupId = str(doc.group_id || doc.groupId);
      if (groupId) {
        await putItem({
          PK: PK.group(groupId),
          SK: SK.expense(ts, id),
          entityType: "group_expense_feed",
          expense_id: id,
          group_id: groupId,
          created_by: str(doc.created_by || doc.createdBy),
          description: str(doc.description),
          amount: num(doc.amount),
          currency: str(doc.currency, "INR"),
          category: str(doc.category, "other"),
          date,
          split_type: str(doc.split_type || doc.splitMethod, "equally"),
          is_deleted: bool(doc.is_deleted),
          is_settled: bool(doc.is_settled),
          created_at: toIso(doc.created_at || doc.createdAt),
          updated_at: toIso(doc.updated_at || doc.updatedAt),
        });
      }

      count++;
    }
  }
  return count;
}

async function migrateSettlements(): Promise<number> {
  const { GSI1PK, GSI1SK, GSI2PK, GSI2SK, PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("settlements");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const date = toIso(doc.date || doc.created_at);
    const ts = toSortableTs(date);
    const fromUserId = str(doc.from_user_id || doc.fromUserId);
    const toUserId = str(doc.to_user_id || doc.toUserId);
    const groupId = str(doc.group_id || doc.groupId);

    const base = {
      id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: num(doc.amount),
      currency: str(doc.currency, "INR"),
      group_id: groupId,
      notes: str(doc.notes || doc.note),
      date,
      is_deleted: bool(doc.is_deleted),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    };

    // Settlement META
    await putItem({ PK: PK.settlement(id), SK: SK.meta, entityType: "settlement", ...base });

    // Fan-out: sent (fromUser's feed)
    await putItem({
      PK: PK.user(fromUserId),
      SK: SK.settlement(ts, id),
      entityType: "settlement_feed",
      GSI1PK: GSI1PK.settlFrom(fromUserId),
      GSI1SK: GSI1SK.settlement(ts, id),
      ...(groupId ? { GSI2PK: GSI2PK.settlGroup(groupId), GSI2SK: GSI2SK.settlement(ts, id) } : {}),
      settlement_id: id,
      user_id: fromUserId,
      direction: "sent",
      ...base,
    });

    // Fan-out: received (toUser's feed)
    await putItem({
      PK: PK.user(toUserId),
      SK: SK.settlement(ts, id),
      entityType: "settlement_feed",
      GSI1PK: GSI1PK.settlTo(toUserId),
      GSI1SK: GSI1SK.settlement(ts, id),
      ...(groupId ? { GSI2PK: GSI2PK.settlGroup(groupId), GSI2SK: GSI2SK.settlement(ts, id) } : {}),
      settlement_id: id,
      user_id: toUserId,
      direction: "received",
      ...base,
    });

    count++;
  }
  return count;
}

async function migrateNotifications(): Promise<number> {
  const { PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const { ttlDaysFromNow } = await import("../src/lib/dynamodb/helpers");
  const col = mongoose.connection.db!.collection("notifications");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const userId = str(doc.user_id || doc.userId);
    const createdAt = toIso(doc.created_at || doc.createdAt);
    const ts = toSortableTs(createdAt);

    await putItem({
      PK: PK.user(userId),
      SK: SK.notification(ts, id),
      entityType: "notification",
      ttl: ttlDaysFromNow(30),
      id,
      user_id: userId,
      type: str(doc.type),
      title: str(doc.title),
      message: str(doc.message),
      is_read: bool(doc.is_read),
      related_id: str(doc.related_id || doc.relatedId),
      related_type: str(doc.related_type || doc.relatedType),
      actor_id: str(doc.actor_id || doc.actorId),
      actor_name: str(doc.actor_name || doc.actorName),
      created_at: createdAt,
    });
    count++;
  }
  return count;
}

async function migrateActivities(): Promise<number> {
  const { PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const { ttlDaysFromNow } = await import("../src/lib/dynamodb/helpers");
  const col = mongoose.connection.db!.collection("activitylogs");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const userId = str(doc.userId || doc.user_id);
    const createdAt = toIso(doc.createdAt || doc.created_at);
    const ts = toSortableTs(createdAt);

    await putItem({
      PK: PK.user(userId),
      SK: SK.activity(ts, id),
      entityType: "activity_log",
      ttl: ttlDaysFromNow(90),
      id,
      userId,
      type: str(doc.type),
      description: str(doc.description),
      relatedId: str(doc.relatedId || doc.related_id),
      relatedType: str(doc.relatedType || doc.related_type),
      actorId: str(doc.actorId || doc.actor_id),
      actorName: str(doc.actorName || doc.actor_name),
      metadata: doc.metadata ?? {},
      createdAt,
    });
    count++;
  }
  return count;
}

async function migrateReminders(): Promise<number> {
  const { GSI1PK, GSI1SK, GSI2PK, GSI2SK, PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("paymentreminders");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const createdAt = toIso(doc.created_at || doc.createdAt);
    const ts = toSortableTs(createdAt);
    const toUserId = str(doc.to_user_id || doc.toUserId);
    const fromUserId = str(doc.from_user_id || doc.fromUserId);
    const status = str(doc.status, "pending");

    await putItem({
      PK: PK.reminder(id),
      SK: SK.meta,
      entityType: "payment_reminder",
      GSI1PK: GSI1PK.reminderTo(toUserId),
      GSI1SK: GSI1SK.reminder(status, ts, id),
      GSI2PK: GSI2PK.reminderFrom(fromUserId),
      GSI2SK: GSI2SK.reminder(status, ts, id),
      id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: num(doc.amount),
      currency: str(doc.currency, "INR"),
      expense_id: str(doc.expense_id || doc.expenseId),
      notes: str(doc.notes),
      status,
      last_push_at: toIso(doc.last_push_at || doc.lastPushAt),
      created_at: createdAt,
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }
  return count;
}

async function migrateInvitations(): Promise<number> {
  const { GSI1PK, GSI1SK, GSI2PK, GSI2SK, PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const { ttlFromDate } = await import("../src/lib/dynamodb/helpers");
  const col = mongoose.connection.db!.collection("invitations");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const createdAt = toIso(doc.created_at || doc.createdAt);
    const ts = toSortableTs(createdAt);
    const email = str(doc.email_normalized || doc.email, "").toLowerCase();
    const status = str(doc.status, "pending");
    const expiresAt = toIso(doc.expires_at || doc.expiresAt);

    await putItem({
      PK: PK.invite(id),
      SK: SK.meta,
      entityType: "invitation",
      GSI1PK: GSI1PK.inviteOwner(str(doc.invited_by || doc.invitedBy)),
      GSI1SK: GSI1SK.invite(ts, id),
      GSI2PK: GSI2PK.inviteEmail(email),
      GSI2SK: GSI2SK.invite(status, ts, id),
      ttl: ttlFromDate(expiresAt),
      id,
      invited_by: str(doc.invited_by || doc.invitedBy),
      email: str(doc.email),
      email_normalized: email,
      name: str(doc.name),
      token: str(doc.token),
      status,
      expires_at: expiresAt,
      group_id: str(doc.group_id || doc.groupId),
      group_name: str(doc.group_name || doc.groupName),
      accepted_by: str(doc.accepted_by || doc.acceptedBy),
      accepted_at: toIso(doc.accepted_at || doc.acceptedAt),
      created_at: createdAt,
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });

    // Token lookup
    const token = str(doc.token);
    if (token) {
      await putItem({
        PK: PK.token(token),
        SK: SK.tokenInvite,
        entityType: "token_lookup",
        invite_id: id,
        expires_at: expiresAt,
        ttl: ttlFromDate(expiresAt),
      });
    }
    count++;
  }
  return count;
}

async function migrateRecurring(): Promise<number> {
  const { GSI1PK, GSI1SK, GSI2PK, GSI2SK, PK, SK, toSortableTs } = await import("../src/lib/dynamodb/keys");
  const tmplCol = mongoose.connection.db!.collection("recurringexpensetemplates");
  const runCol = mongoose.connection.db!.collection("recurringexpenseruns");
  const docs = await tmplCol.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const ownerId = str(doc.owner_id || doc.ownerId);
    const nextRunDate = toIso(doc.next_run_date || doc.nextRunDate);

    await putItem({
      PK: PK.recurring(id),
      SK: SK.meta,
      entityType: "recurring_template",
      GSI1PK: GSI1PK.recurOwner(ownerId),
      GSI1SK: GSI1SK.recurring(id),
      GSI2PK: GSI2PK.due(nextRunDate.slice(0, 10)),
      GSI2SK: GSI2SK.recurring(id),
      id,
      owner_id: ownerId,
      participant_ids: Array.isArray(doc.participant_ids) ? doc.participant_ids : [],
      description: str(doc.description),
      amount: num(doc.amount),
      currency: str(doc.currency, "INR"),
      category: str(doc.category),
      split_type: str(doc.split_type || doc.splitType, "equally"),
      group_id: str(doc.group_id || doc.groupId),
      frequency: str(doc.frequency, "monthly"),
      interval: num(doc.interval) || 1,
      start_date: toIso(doc.start_date || doc.startDate),
      end_date: doc.end_date ? toIso(doc.end_date) : null,
      next_run_date: nextRunDate,
      is_active: bool(doc.is_active !== false),
      last_run_date: doc.last_run_date ? toIso(doc.last_run_date) : null,
      run_count: num(doc.run_count),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }

  // Migrate recurring runs
  const runs = await runCol.find({}).toArray();
  for (const run of runs) {
    const id = str(run._id);
    const templateId = str(run.template_id || run.templateId);
    const runDate = toIso(run.run_date || run.runDate);

    await putItem({
      PK: PK.recurring(templateId),
      SK: SK.run(runDate.slice(0, 10), id),
      entityType: "recurring_run",
      id,
      template_id: templateId,
      owner_id: str(run.owner_id || run.ownerId),
      expense_id: str(run.expense_id || run.expenseId),
      run_date: runDate,
      status: str(run.status, "success"),
      error: str(run.error),
      created_at: toIso(run.created_at || run.createdAt),
    });
  }

  return count;
}

async function migrateNudges(): Promise<number> {
  const { PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("usernudgestates");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const userId = str(doc.user_id || doc.userId);
    const nudgeId = str(doc.nudge_id || doc.nudgeId);
    if (!userId || !nudgeId) continue;

    await putItem({
      PK: PK.user(userId),
      SK: SK.nudge(nudgeId),
      entityType: "user_nudge",
      user_id: userId,
      nudge_id: nudgeId,
      state: doc.state ?? {},
      last_nudge_at: toIso(doc.last_nudge_at || doc.lastNudgeAt),
      nudge_count: num(doc.nudge_count || doc.nudgeCount),
      created_at: toIso(doc.created_at || doc.createdAt),
      updated_at: toIso(doc.updated_at || doc.updatedAt),
    });
    count++;
  }
  return count;
}

async function migrateFeedback(): Promise<number> {
  const { GSI1PK, GSI1SK, PK, SK } = await import("../src/lib/dynamodb/keys");
  const col = mongoose.connection.db!.collection("featurefeedbacks");
  const docs = await col.find({}).toArray();
  let count = 0;

  for (const doc of docs) {
    const id = str(doc._id);
    const category = str(doc.category, "general");
    const upvotes = num(doc.upvotes);

    await putItem({
      PK: PK.feedback(id),
      SK: SK.meta,
      entityType: "feedback",
      GSI1PK: GSI1PK.feedbackCat(category),
      GSI1SK: GSI1SK.feedback(upvotes, id),
      id,
      category,
      title: str(doc.title),
      description: str(doc.description),
      status: str(doc.status, "open"),
      priority: str(doc.priority, "medium"),
      upvotes,
      downvotes: num(doc.downvotes),
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      created_by: str(doc.created_by || doc.createdBy),
      created_at: toIso(doc.created_at || doc.createdAt),
    });
    count++;
  }
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface CollectionTask {
  name: string;
  fn: () => Promise<number>;
}

const TASKS: CollectionTask[] = [
  { name: "users",          fn: migrateUsers },
  { name: "friendships",    fn: migrateFriendships },
  { name: "groups",         fn: migrateGroups },
  { name: "group_members",  fn: migrateGroupMembers },
  { name: "expenses",       fn: migrateExpenses },
  { name: "settlements",    fn: migrateSettlements },
  { name: "notifications",  fn: migrateNotifications },
  { name: "activities",     fn: migrateActivities },
  { name: "reminders",      fn: migrateReminders },
  { name: "invitations",    fn: migrateInvitations },
  { name: "recurring",      fn: migrateRecurring },
  { name: "nudges",         fn: migrateNudges },
  { name: "feedback",       fn: migrateFeedback },
];

async function main(): Promise<void> {
  console.log(`\n🚀 DooSplit MongoDB → DynamoDB Migration`);
  console.log(`   Region : ${REGION}`);
  console.log(`   Table  : ${TABLE}`);
  console.log(`   DRY RUN: ${DRY_RUN}\n`);

  await connectMongo();

  for (const task of TASKS) {
    const state = await getMigrationState(task.name);
    if (state.status === "completed" && !DRY_RUN) {
      console.log(`⏭  ${task.name}: already completed (${state.count} items) — skipping`);
      continue;
    }

    try {
      await saveMigrationState(task.name, 0, "running");
      console.log(`⏳ ${task.name}: migrating…`);
      const count = await task.fn();
      await saveMigrationState(task.name, count, "completed");
      console.log(`✓  ${task.name}: ${count} items`);
    } catch (err: any) {
      await saveMigrationState(task.name, 0, "error", err?.message || String(err));
      console.error(`✗  ${task.name}: ERROR — ${err?.message || err}`);
    }
  }

  await mongoose.disconnect();
  console.log("\n✅ Migration complete.");
  if (DRY_RUN) console.log("   (DRY RUN — no data was written to DynamoDB)");
  console.log("\nNext: set DATA_BACKEND=dynamodb and re-deploy to Vercel.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

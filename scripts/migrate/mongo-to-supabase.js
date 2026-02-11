#!/usr/bin/env node

const path = require("path");
const {
  buildEnv,
  chunk,
  createMongoConnection,
  createSupabaseAdmin,
  parseArgs,
  toIsoOrNull,
  toObjectIdString,
  writeJsonArtifact,
} = require("./_utils");

const COLLECTION_MAP = {
  users: "users",
  friends: "friendships",
  groups: "groups",
  groupmembers: "group_members",
  expenses: "expenses",
  expenseparticipants: "expense_participants",
  settlements: "settlements",
  notifications: "notifications",
  invitations: "invitations",
  paymentreminders: "payment_reminders",
};

function normalizeMethod(value) {
  if (!value) return "upi";
  const normalized = String(value).trim().toLowerCase();
  if (["cash", "upi", "bank_transfer", "paytm", "gpay", "phonepe", "other"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "bank transfer") return "bank_transfer";
  return "other";
}

function transformRecord(collection, doc) {
  switch (collection) {
    case "users":
      return {
        id: toObjectIdString(doc._id),
        email: String(doc.email || "").toLowerCase(),
        password: doc.password || null,
        name: doc.name || "Unknown",
        phone: doc.phone || null,
        profile_picture: doc.profilePicture || null,
        default_currency: doc.defaultCurrency || "INR",
        timezone: doc.timezone || "Asia/Kolkata",
        language: doc.language || "en",
        is_active: doc.isActive !== false,
        is_dummy: !!doc.isDummy,
        created_by: toObjectIdString(doc.createdBy),
        role: doc.role === "admin" ? "admin" : "user",
        email_verified: !!doc.emailVerified,
        auth_provider: doc.authProvider === "firebase" ? "firebase" : "email",
        reset_password_token: doc.resetPasswordToken || null,
        reset_password_expires: toIsoOrNull(doc.resetPasswordExpires),
        push_notifications_enabled: !!doc.pushNotificationsEnabled,
        email_notifications_enabled:
          doc.emailNotificationsEnabled === undefined
            ? true
            : !!doc.emailNotificationsEnabled,
        push_subscription: doc.pushSubscription || null,
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "friends":
      return {
        id: toObjectIdString(doc._id),
        user_id: toObjectIdString(doc.userId),
        friend_id: toObjectIdString(doc.friendId),
        status: doc.status || "pending",
        requested_by: toObjectIdString(doc.requestedBy) || toObjectIdString(doc.userId),
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "groups":
      return {
        id: toObjectIdString(doc._id),
        name: doc.name || "Unnamed group",
        description: doc.description || null,
        image: doc.image || null,
        type: doc.type || "other",
        currency: doc.currency || "INR",
        created_by: toObjectIdString(doc.createdBy),
        is_active: doc.isActive !== false,
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "groupmembers":
      return {
        id: toObjectIdString(doc._id),
        group_id: toObjectIdString(doc.groupId),
        user_id: toObjectIdString(doc.userId),
        role: doc.role || "member",
        joined_at: toIsoOrNull(doc.joinedAt),
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "expenses":
      return {
        id: toObjectIdString(doc._id),
        amount: Number(doc.amount || 0),
        description: doc.description || "",
        category: doc.category || "other",
        date: toIsoOrNull(doc.date) || toIsoOrNull(doc.createdAt),
        currency: doc.currency || "INR",
        created_by: toObjectIdString(doc.createdBy),
        group_id: toObjectIdString(doc.groupId),
        images: Array.isArray(doc.images) ? doc.images : [],
        notes: doc.notes || null,
        is_deleted: !!doc.isDeleted,
        edit_history: Array.isArray(doc.editHistory) ? doc.editHistory : [],
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "expenseparticipants":
      return {
        id: toObjectIdString(doc._id),
        expense_id: toObjectIdString(doc.expenseId),
        user_id: toObjectIdString(doc.userId),
        paid_amount: Number(doc.paidAmount || 0),
        owed_amount: Number(doc.owedAmount || 0),
        is_settled: !!doc.isSettled,
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "settlements":
      return {
        id: toObjectIdString(doc._id),
        from_user_id: toObjectIdString(doc.fromUserId),
        to_user_id: toObjectIdString(doc.toUserId),
        amount: Number(doc.amount || 0),
        currency: doc.currency || "INR",
        method: normalizeMethod(doc.method),
        note: doc.note || null,
        screenshot: doc.screenshot || null,
        date: toIsoOrNull(doc.date) || toIsoOrNull(doc.createdAt),
        group_id: toObjectIdString(doc.groupId),
        version: Number(doc.version || 1),
        last_modified: toIsoOrNull(doc.lastModified) || toIsoOrNull(doc.updatedAt),
        modified_by: toObjectIdString(doc.modifiedBy) || toObjectIdString(doc.fromUserId),
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "notifications":
      return {
        id: toObjectIdString(doc._id),
        user_id: toObjectIdString(doc.userId),
        type: doc.type || "unknown",
        message: doc.message || "",
        data: doc.data || {},
        is_read: !!doc.isRead,
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "invitations":
      return {
        id: toObjectIdString(doc._id),
        invited_by: toObjectIdString(doc.invitedBy),
        email: String(doc.email || "").toLowerCase(),
        token: doc.token || "",
        status: doc.status || "pending",
        expires_at: toIsoOrNull(doc.expiresAt),
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    case "paymentreminders":
      return {
        id: toObjectIdString(doc._id),
        from_user_id: toObjectIdString(doc.fromUserId),
        to_user_id: toObjectIdString(doc.toUserId),
        amount: Number(doc.amount || 0),
        currency: doc.currency || "INR",
        message: doc.message || null,
        status: doc.status || "pending",
        sent_at: toIsoOrNull(doc.sentAt),
        read_at: toIsoOrNull(doc.readAt),
        paid_at: toIsoOrNull(doc.paidAt),
        created_at: toIsoOrNull(doc.createdAt),
        updated_at: toIsoOrNull(doc.updatedAt),
      };
    default:
      throw new Error(`Unsupported collection: ${collection}`);
  }
}

async function logMigration(supabase, payload) {
  try {
    await supabase.from("migration_logs").insert(payload);
  } catch (error) {
    console.warn("Failed to write migration_logs entry:", error?.message || error);
  }
}

async function migrateCollection({
  db,
  supabase,
  collection,
  runId,
  batchSize,
  dryRun,
}) {
  const source = db.collection(collection);
  const targetTable = COLLECTION_MAP[collection];
  if (!targetTable) {
    throw new Error(`Collection ${collection} is not mapped`);
  }

  const docs = await source.find({}).toArray();
  const startedAt = new Date().toISOString();
  const transformed = docs.map((doc) => transformRecord(collection, doc));
  const batches = chunk(transformed, batchSize);
  let processed = 0;
  let errors = 0;
  const details = [];

  for (const batch of batches) {
    if (!dryRun) {
      const { error } = await supabase
        .from(targetTable)
        .upsert(batch, { onConflict: "id" });
      if (error) {
        errors += batch.length;
        details.push(error.message);
        continue;
      }
    }
    processed += batch.length;
  }

  const finishedAt = new Date().toISOString();
  await logMigration(supabase, {
    run_id: runId,
    collection,
    status: dryRun ? "dry-run" : errors > 0 ? "error" : "success",
    total_records: transformed.length,
    processed_records: processed,
    error_count: errors,
    error_details: details.length ? details : null,
    started_at: startedAt,
    finished_at: finishedAt,
  });

  return {
    collection,
    table: targetTable,
    total: transformed.length,
    processed,
    errors,
    dryRun,
    details,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"] || `migrate-${Date.now()}`;
  const collectionArg = args.collection || "all";
  const batchSize = Number.parseInt(args["batch-size"] || "200", 10);
  const dryRun = args["dry-run"] === true || args["dry-run"] === "true";

  const selectedCollections =
    collectionArg === "all"
      ? Object.keys(COLLECTION_MAP)
      : collectionArg
          .split(",")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

  const env = buildEnv();
  const mongoClient = await createMongoConnection(env);
  const supabase = createSupabaseAdmin(env);
  const db = mongoClient.db();

  const summary = {
    runId,
    dryRun,
    batchSize,
    startedAt: new Date().toISOString(),
    collections: [],
  };

  for (const collection of selectedCollections) {
    if (!COLLECTION_MAP[collection]) {
      throw new Error(`Unknown --collection value "${collection}"`);
    }
    const result = await migrateCollection({
      db,
      supabase,
      collection,
      runId,
      batchSize: Number.isFinite(batchSize) ? Math.max(1, batchSize) : 200,
      dryRun,
    });
    summary.collections.push(result);
  }

  await mongoClient.close();
  summary.finishedAt = new Date().toISOString();

  const outPath = path.resolve("docs", "migration", `${runId}-mongo-to-supabase.json`);
  writeJsonArtifact(outPath, summary);
  console.log(JSON.stringify({ ...summary, artifact: outPath }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
});

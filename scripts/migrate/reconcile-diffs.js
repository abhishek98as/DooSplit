#!/usr/bin/env node

const fs = require("fs");
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
  const method = String(value || "upi").toLowerCase();
  if (["cash", "upi", "bank_transfer", "paytm", "gpay", "phonepe", "other"].includes(method)) {
    return method;
  }
  return "other";
}

function transformRecord(collection, doc) {
  if (collection === "users") {
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
  }
  if (collection === "friends") {
    return {
      id: toObjectIdString(doc._id),
      user_id: toObjectIdString(doc.userId),
      friend_id: toObjectIdString(doc.friendId),
      status: doc.status || "pending",
      requested_by: toObjectIdString(doc.requestedBy) || toObjectIdString(doc.userId),
      created_at: toIsoOrNull(doc.createdAt),
      updated_at: toIsoOrNull(doc.updatedAt),
    };
  }
  if (collection === "groups") {
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
  }
  if (collection === "groupmembers") {
    return {
      id: toObjectIdString(doc._id),
      group_id: toObjectIdString(doc.groupId),
      user_id: toObjectIdString(doc.userId),
      role: doc.role || "member",
      joined_at: toIsoOrNull(doc.joinedAt),
      created_at: toIsoOrNull(doc.createdAt),
      updated_at: toIsoOrNull(doc.updatedAt),
    };
  }
  if (collection === "expenses") {
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
  }
  if (collection === "expenseparticipants") {
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
  }
  if (collection === "settlements") {
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
  }
  if (collection === "notifications") {
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
  }
  if (collection === "invitations") {
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
  }
  if (collection === "paymentreminders") {
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
  }
  throw new Error(`Unsupported collection ${collection}`);
}

async function upsertDocs(supabase, table, rows, batchSize) {
  const groups = chunk(rows, batchSize);
  let processed = 0;
  let errors = 0;
  const details = [];
  for (const group of groups) {
    const { error } = await supabase.from(table).upsert(group, { onConflict: "id" });
    if (error) {
      errors += group.length;
      details.push(error.message);
      continue;
    }
    processed += group.length;
  }
  return { processed, errors, details };
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"] || `reconcile-${Date.now()}`;
  const parityFile = args["parity-file"];
  const batchSizeRaw = Number.parseInt(args["batch-size"] || "200", 10);
  const batchSize = Number.isFinite(batchSizeRaw) ? Math.max(1, batchSizeRaw) : 200;
  const fullOnDelta = args["full-on-count-delta"] === true || args["full-on-count-delta"] === "true";

  if (!parityFile) {
    throw new Error("Missing --parity-file path");
  }

  const parityPath = path.resolve(parityFile);
  if (!fs.existsSync(parityPath)) {
    throw new Error(`Parity file does not exist: ${parityPath}`);
  }

  const parity = JSON.parse(fs.readFileSync(parityPath, "utf8"));
  const env = buildEnv();
  const mongoClient = await createMongoConnection(env);
  const db = mongoClient.db();
  const supabase = createSupabaseAdmin(env);

  const summary = {
    runId,
    parityFile: parityPath,
    startedAt: new Date().toISOString(),
    collections: [],
  };

  for (const collectionEntry of parity.collections || []) {
    const collection = collectionEntry.collection;
    const table = COLLECTION_MAP[collection];
    if (!table) continue;

    const mongoCol = db.collection(collection);
    let targetIds = (collectionEntry.sampleDiffs || []).map((diff) => diff.id);

    if (fullOnDelta && collectionEntry.countDelta !== 0) {
      const fullDocs = await mongoCol.find({}).project({ _id: 1 }).toArray();
      targetIds = fullDocs.map((doc) => doc._id.toString());
    }

    targetIds = Array.from(new Set(targetIds.filter(Boolean)));
    if (targetIds.length === 0) {
      summary.collections.push({
        collection,
        table,
        retried: 0,
        processed: 0,
        errors: 0,
      });
      continue;
    }

    const docs = await mongoCol
      .find({
        _id: {
          $in: targetIds.map((id) => {
            try {
              return new (require("mongodb").ObjectId)(id);
            } catch {
              return id;
            }
          }),
        },
      })
      .toArray();

    const rows = docs.map((doc) => transformRecord(collection, doc));
    const result = await upsertDocs(supabase, table, rows, batchSize);

    summary.collections.push({
      collection,
      table,
      retried: targetIds.length,
      foundInMongo: rows.length,
      ...result,
    });
  }

  await mongoClient.close();
  summary.finishedAt = new Date().toISOString();

  const outPath = path.resolve("docs", "migration", `${runId}-reconcile.json`);
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

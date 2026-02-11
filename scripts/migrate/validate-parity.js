#!/usr/bin/env node

const crypto = require("crypto");
const path = require("path");
const {
  buildEnv,
  createMongoConnection,
  createSupabaseAdmin,
  parseArgs,
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

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function normalizeMongoDoc(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === "_id") {
      out.id = value.toString();
      continue;
    }

    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }

    if (value && typeof value === "object" && value.toString && value._bsontype) {
      out[key] = value.toString();
      continue;
    }

    out[key] = value;
  }
  return sortObject(out);
}

function normalizeSupabaseRow(row) {
  return sortObject(row);
}

function fingerprint(value) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function getSupabaseCount(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    throw error;
  }
  return count || 0;
}

async function getSupabaseRowsByIds(supabase, table, ids) {
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase.from(table).select("*").in("id", ids);
  if (error) {
    throw error;
  }
  return data || [];
}

async function validateCollection({
  db,
  supabase,
  collection,
  sampleSize,
}) {
  const table = COLLECTION_MAP[collection];
  const mongoCol = db.collection(collection);
  const mongoCount = await mongoCol.countDocuments();
  const supabaseCount = await getSupabaseCount(supabase, table);

  const sample = await mongoCol.aggregate([{ $sample: { size: sampleSize } }]).toArray();
  const sampleIds = sample.map((doc) => doc._id.toString());
  const rows = await getSupabaseRowsByIds(supabase, table, sampleIds);
  const byId = new Map(rows.map((row) => [String(row.id), row]));

  const sampleDiffs = [];
  for (const doc of sample) {
    const id = doc._id.toString();
    const mongoHash = fingerprint(normalizeMongoDoc(doc));
    const row = byId.get(id);
    if (!row) {
      sampleDiffs.push({
        id,
        type: "missing_in_supabase",
      });
      continue;
    }

    const supabaseHash = fingerprint(normalizeSupabaseRow(row));
    if (mongoHash !== supabaseHash) {
      sampleDiffs.push({
        id,
        type: "payload_mismatch",
        mongoHash,
        supabaseHash,
      });
    }
  }

  return {
    collection,
    table,
    mongoCount,
    supabaseCount,
    countDelta: supabaseCount - mongoCount,
    sampleChecked: sample.length,
    sampleDiffCount: sampleDiffs.length,
    sampleDiffs: sampleDiffs.slice(0, 20),
  };
}

async function fetchIdSet(supabase, table) {
  let from = 0;
  const size = 1000;
  const ids = new Set();
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .range(from, from + size - 1);
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    for (const row of data) {
      ids.add(String(row.id));
    }
    if (data.length < size) {
      break;
    }
    from += size;
  }
  return ids;
}

async function countOrphans(supabase, childTable, fkColumn, validIds) {
  let from = 0;
  const size = 1000;
  let orphans = 0;
  while (true) {
    const { data, error } = await supabase
      .from(childTable)
      .select(`id,${fkColumn}`)
      .range(from, from + size - 1);
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    for (const row of data) {
      const key = row[fkColumn];
      if (key && !validIds.has(String(key))) {
        orphans += 1;
      }
    }
    if (data.length < size) {
      break;
    }
    from += size;
  }
  return orphans;
}

async function validateReferentialIntegrity(supabase) {
  const userIds = await fetchIdSet(supabase, "users");
  const groupIds = await fetchIdSet(supabase, "groups");
  const expenseIds = await fetchIdSet(supabase, "expenses");

  const checks = [];
  checks.push({
    table: "friendships.user_id",
    orphanCount: await countOrphans(supabase, "friendships", "user_id", userIds),
  });
  checks.push({
    table: "friendships.friend_id",
    orphanCount: await countOrphans(supabase, "friendships", "friend_id", userIds),
  });
  checks.push({
    table: "group_members.group_id",
    orphanCount: await countOrphans(supabase, "group_members", "group_id", groupIds),
  });
  checks.push({
    table: "group_members.user_id",
    orphanCount: await countOrphans(supabase, "group_members", "user_id", userIds),
  });
  checks.push({
    table: "expense_participants.expense_id",
    orphanCount: await countOrphans(
      supabase,
      "expense_participants",
      "expense_id",
      expenseIds
    ),
  });
  checks.push({
    table: "expense_participants.user_id",
    orphanCount: await countOrphans(supabase, "expense_participants", "user_id", userIds),
  });
  checks.push({
    table: "settlements.from_user_id",
    orphanCount: await countOrphans(supabase, "settlements", "from_user_id", userIds),
  });
  checks.push({
    table: "settlements.to_user_id",
    orphanCount: await countOrphans(supabase, "settlements", "to_user_id", userIds),
  });

  return checks;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"] || `parity-${Date.now()}`;
  const sampleSizeRaw = Number.parseInt(args["sample-size"] || "20", 10);
  const sampleSize = Number.isFinite(sampleSizeRaw) ? Math.max(1, sampleSizeRaw) : 20;

  const env = buildEnv();
  const mongoClient = await createMongoConnection(env);
  const db = mongoClient.db();
  const supabase = createSupabaseAdmin(env);

  const summary = {
    runId,
    sampleSize,
    startedAt: new Date().toISOString(),
    collections: [],
    referentialIntegrity: [],
  };

  for (const collection of Object.keys(COLLECTION_MAP)) {
    const result = await validateCollection({
      db,
      supabase,
      collection,
      sampleSize,
    });
    summary.collections.push(result);
  }

  summary.referentialIntegrity = await validateReferentialIntegrity(supabase);
  summary.finishedAt = new Date().toISOString();

  await mongoClient.close();

  const outPath = path.resolve("docs", "migration", `${runId}-parity.json`);
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

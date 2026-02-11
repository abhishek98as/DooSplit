#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { createClient } = require("redis");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function clearRedisForUsers(env, userIds) {
  if (!env.REDIS_URL || userIds.length === 0) {
    return { skipped: true, cleared: 0 };
  }

  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const prefix = env.CACHE_PREFIX || "doosplit:v1";
  const keys = new Set();

  for (const userId of userIds) {
    const patterns = [
      `${prefix}:*:user:${userId}:*`,
      `${prefix}:reg:*:${userId}`,
    ];

    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 500 });
        cursor = String(reply.cursor);
        for (const key of reply.keys) {
          keys.add(key);
        }
      } while (String(cursor) !== "0");
    }
  }

  if (keys.size > 0) {
    await client.del([...keys]);
  }

  await client.quit();
  return {
    skipped: false,
    cleared: keys.size,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"];
  if (!runId) {
    throw new Error("Missing required --run-id");
  }

  const env = {
    ...loadEnv(path.resolve(".env.local")),
    ...process.env,
  };

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const perfTag = `PERF_${runId}`;

  const client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db();

  const users = db.collection("users");
  const friends = db.collection("friends");
  const groups = db.collection("groups");
  const groupMembers = db.collection("groupmembers");
  const expenses = db.collection("expenses");
  const expenseParticipants = db.collection("expenseparticipants");
  const settlements = db.collection("settlements");
  const notifications = db.collection("notifications");
  const invitations = db.collection("invitations");
  const paymentReminders = db.collection("paymentreminders");
  const activities = db.collection("activities");

  const perfUsers = await users.find({ perfTag }).project({ _id: 1 }).toArray();
  const userIds = perfUsers.map((user) => user._id);

  const groupDocs = await groups
    .find({
      $or: [{ perfTag }, { createdBy: { $in: userIds } }],
    })
    .project({ _id: 1 })
    .toArray();
  const groupIds = groupDocs.map((group) => group._id);

  const expenseDocs = await expenses
    .find({
      $or: [{ perfTag }, { createdBy: { $in: userIds } }, { groupId: { $in: groupIds } }],
    })
    .project({ _id: 1 })
    .toArray();
  const expenseIds = expenseDocs.map((expense) => expense._id);

  const result = {};

  result.expenseParticipants = (
    await expenseParticipants.deleteMany({
      $or: [{ perfTag }, { expenseId: { $in: expenseIds } }, { userId: { $in: userIds } }],
    })
  ).deletedCount;

  result.expenses = (
    await expenses.deleteMany({
      $or: [{ perfTag }, { _id: { $in: expenseIds } }, { createdBy: { $in: userIds } }],
    })
  ).deletedCount;

  result.settlements = (
    await settlements.deleteMany({
      $or: [{ perfTag }, { fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }],
    })
  ).deletedCount;

  result.groupMembers = (
    await groupMembers.deleteMany({
      $or: [{ perfTag }, { groupId: { $in: groupIds } }, { userId: { $in: userIds } }],
    })
  ).deletedCount;

  result.groups = (
    await groups.deleteMany({
      $or: [{ perfTag }, { _id: { $in: groupIds } }, { createdBy: { $in: userIds } }],
    })
  ).deletedCount;

  result.friends = (
    await friends.deleteMany({
      $or: [{ perfTag }, { userId: { $in: userIds } }, { friendId: { $in: userIds } }],
    })
  ).deletedCount;

  result.notifications = (
    await notifications.deleteMany({
      $or: [{ perfTag }, { userId: { $in: userIds } }],
    })
  ).deletedCount;

  result.invitations = (
    await invitations.deleteMany({
      $or: [{ perfTag }, { invitedBy: { $in: userIds } }],
    })
  ).deletedCount;

  result.paymentReminders = (
    await paymentReminders.deleteMany({
      $or: [{ perfTag }, { fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }],
    })
  ).deletedCount;

  // Optional collection in some deployments.
  if (activities) {
    result.activities = (
      await activities.deleteMany({
        $or: [{ perfTag }, { userId: { $in: userIds } }],
      })
    ).deletedCount;
  }

  result.users = (
    await users.deleteMany({
      $or: [{ perfTag }, { _id: { $in: userIds } }],
    })
  ).deletedCount;

  const redisCleanup = await clearRedisForUsers(
    env,
    userIds.map((id) => id.toString())
  );

  await client.close();

  console.log(
    JSON.stringify(
      {
        runId,
        perfTag,
        deleted: result,
        redisCleanup,
      },
      null,
      2
    )
  );
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

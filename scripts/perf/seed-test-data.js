#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");

const SIZE_CONFIG = {
  small: { expenses: 20, groups: 3, friends: 10, settlements: 4 },
  medium: { expenses: 200, groups: 15, friends: 40, settlements: 20 },
  large: { expenses: 1000, groups: 40, friends: 100, settlements: 80 },
};

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(items) {
  return items[randomInt(0, items.length - 1)];
}

function pickUnique(items, count) {
  const pool = [...items];
  const selected = [];
  const safeCount = Math.min(count, pool.length);
  for (let i = 0; i < safeCount; i += 1) {
    const index = randomInt(0, pool.length - 1);
    selected.push(pool[index]);
    pool.splice(index, 1);
  }
  return selected;
}

function categoryFor(index) {
  const categories = [
    "food",
    "transport",
    "shopping",
    "entertainment",
    "utilities",
    "rent",
    "healthcare",
    "other",
  ];
  return categories[index % categories.length];
}

function buildExpenseParticipants(participantIds, payerId, amount, expenseId) {
  const owed = Number((amount / participantIds.length).toFixed(2));
  const participants = [];
  let runningOwed = 0;

  for (let i = 0; i < participantIds.length; i += 1) {
    let owedAmount = owed;
    if (i === participantIds.length - 1) {
      owedAmount = Number((amount - runningOwed).toFixed(2));
    }
    runningOwed = Number((runningOwed + owedAmount).toFixed(2));

    participants.push({
      _id: new ObjectId(),
      expenseId,
      userId: participantIds[i],
      paidAmount: participantIds[i].toString() === payerId.toString() ? amount : 0,
      owedAmount,
      isSettled: false,
      perfTag: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return participants;
}

async function main() {
  const args = parseArgs(process.argv);
  const size = args.size || "small";
  const runId = args["run-id"] || `perf-${Date.now()}`;

  if (!SIZE_CONFIG[size]) {
    throw new Error(
      `Invalid --size value "${size}". Use one of: ${Object.keys(SIZE_CONFIG).join(", ")}`
    );
  }

  const env = {
    ...loadEnv(path.resolve(".env.local")),
    ...process.env,
  };

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const cfg = SIZE_CONFIG[size];
  const perfTag = `PERF_${runId}`;
  const mainEmail = `perf_${runId}_main@example.com`;
  const testPassword = "Perf@12345";

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

  const passwordHash = await bcrypt.hash(testPassword, 10);
  const now = new Date();

  const mainUserId = new ObjectId();
  const mainUser = {
    _id: mainUserId,
    email: mainEmail.toLowerCase(),
    password: passwordHash,
    name: `Perf Main ${runId}`,
    defaultCurrency: "INR",
    timezone: "Asia/Kolkata",
    language: "en",
    isActive: true,
    isDummy: false,
    role: "user",
    emailVerified: true,
    authProvider: "email",
    perfTag,
    createdAt: now,
    updatedAt: now,
  };

  const friendUsers = [];
  for (let i = 0; i < cfg.friends; i += 1) {
    const userId = new ObjectId();
    friendUsers.push({
      _id: userId,
      email: `perf_${runId}_friend_${i}@example.com`,
      password: passwordHash,
      name: `Perf Friend ${i}`,
      defaultCurrency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      isActive: true,
      isDummy: false,
      role: "user",
      emailVerified: true,
      authProvider: "email",
      perfTag,
      createdAt: now,
      updatedAt: now,
    });
  }

  await users.insertMany([mainUser, ...friendUsers], { ordered: false });

  const friendEdges = [];
  for (const friendUser of friendUsers) {
    friendEdges.push({
      _id: new ObjectId(),
      userId: mainUserId,
      friendId: friendUser._id,
      status: "accepted",
      requestedBy: mainUserId,
      perfTag,
      createdAt: now,
      updatedAt: now,
    });
    friendEdges.push({
      _id: new ObjectId(),
      userId: friendUser._id,
      friendId: mainUserId,
      status: "accepted",
      requestedBy: mainUserId,
      perfTag,
      createdAt: now,
      updatedAt: now,
    });
  }
  await friends.insertMany(friendEdges, { ordered: false });

  const groupDocs = [];
  const groupMemberDocs = [];

  for (let i = 0; i < cfg.groups; i += 1) {
    const groupId = new ObjectId();
    groupDocs.push({
      _id: groupId,
      name: `Perf Group ${i}`,
      description: `Performance test group ${i}`,
      type: "other",
      currency: "INR",
      createdBy: mainUserId,
      isActive: true,
      perfTag,
      createdAt: now,
      updatedAt: now,
    });

    groupMemberDocs.push({
      _id: new ObjectId(),
      groupId,
      userId: mainUserId,
      role: "admin",
      joinedAt: now,
      perfTag,
      createdAt: now,
      updatedAt: now,
    });

    const memberCount = randomInt(2, Math.min(8, friendUsers.length));
    const selectedMembers = pickUnique(friendUsers, memberCount);
    for (const member of selectedMembers) {
      groupMemberDocs.push({
        _id: new ObjectId(),
        groupId,
        userId: member._id,
        role: "member",
        joinedAt: now,
        perfTag,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (groupDocs.length > 0) {
    await groups.insertMany(groupDocs, { ordered: false });
    await groupMembers.insertMany(groupMemberDocs, { ordered: false });
  }

  const allUsers = [mainUser, ...friendUsers];
  const expenseDocs = [];
  const expenseParticipantDocs = [];

  for (let i = 0; i < cfg.expenses; i += 1) {
    const expenseId = new ObjectId();
    const amount = Number((randomInt(200, 20000) / 10).toFixed(2));
    const createdAt = new Date(now.getTime() - randomInt(0, 90) * 24 * 60 * 60 * 1000);
    const withGroup = groupDocs.length > 0 && Math.random() < 0.75;
    const group = withGroup ? pickRandom(groupDocs) : null;

    const participantCount = group ? randomInt(2, 4) : 2;
    const peers = pickUnique(friendUsers, Math.max(1, participantCount - 1));
    const participantUsers = [mainUser, ...peers].slice(0, participantCount);
    const payer = pickRandom(participantUsers);

    expenseDocs.push({
      _id: expenseId,
      amount,
      description: `Perf expense ${i}`,
      category: categoryFor(i),
      date: createdAt,
      currency: "INR",
      createdBy: payer._id,
      groupId: group ? group._id : null,
      images: [],
      notes: "",
      isDeleted: false,
      editHistory: [],
      perfTag,
      createdAt,
      updatedAt: createdAt,
    });

    const participants = buildExpenseParticipants(
      participantUsers.map((user) => user._id),
      payer._id,
      amount,
      expenseId
    );
    for (const participant of participants) {
      participant.perfTag = perfTag;
      expenseParticipantDocs.push(participant);
    }
  }

  if (expenseDocs.length > 0) {
    await expenses.insertMany(expenseDocs, { ordered: false });
    await expenseParticipants.insertMany(expenseParticipantDocs, { ordered: false });
  }

  const settlementDocs = [];
  for (let i = 0; i < cfg.settlements; i += 1) {
    const fromUser = pickRandom(friendUsers);
    const toUser = mainUser;
    const createdAt = new Date(now.getTime() - randomInt(0, 30) * 24 * 60 * 60 * 1000);

    settlementDocs.push({
      _id: new ObjectId(),
      fromUserId: fromUser._id,
      toUserId: toUser._id,
      amount: Number((randomInt(100, 10000) / 10).toFixed(2)),
      currency: "INR",
      method: "upi",
      note: "perf settlement",
      screenshot: null,
      date: createdAt,
      groupId: null,
      version: 1,
      lastModified: createdAt,
      modifiedBy: fromUser._id,
      perfTag,
      createdAt,
      updatedAt: createdAt,
    });
  }

  if (settlementDocs.length > 0) {
    await settlements.insertMany(settlementDocs, { ordered: false });
  }

  await client.close();

  const summary = {
    runId,
    perfTag,
    size,
    credentials: {
      email: mainEmail,
      password: testPassword,
    },
    inserted: {
      users: 1 + friendUsers.length,
      friends: friendEdges.length,
      groups: groupDocs.length,
      groupMembers: groupMemberDocs.length,
      expenses: expenseDocs.length,
      expenseParticipants: expenseParticipantDocs.length,
      settlements: settlementDocs.length,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
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

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");
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

async function timed(fn) {
  const start = Date.now();
  const value = await fn();
  return {
    ms: Date.now() - start,
    value,
  };
}

async function runWithConcurrency(items, limit, worker) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = headers.get("set-cookie");
  if (!raw) {
    return [];
  }

  return raw.split(/,(?=[^;,]+=)/g);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const list = getSetCookies(headers);
    for (const cookie of list) {
      const firstPart = cookie.split(";")[0];
      const index = firstPart.indexOf("=");
      if (index <= 0) continue;
      const key = firstPart.slice(0, index).trim();
      const value = firstPart.slice(index + 1).trim();
      if (!key || !value) continue;
      this.cookies.set(key, value);
    }
  }

  toHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  toHeaders(extra = {}) {
    const headers = { ...extra };
    const cookieHeader = this.toHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    return headers;
  }
}

async function clearRedisUserKeys(env, userId) {
  if (!env.REDIS_URL) {
    return { skipped: true, cleared: 0 };
  }

  const client = createClient({ url: env.REDIS_URL });
  await client.connect();

  const prefix = env.CACHE_PREFIX || "doosplit:v1";
  const patterns = [
    `${prefix}:*:user:${userId}:*`,
    `${prefix}:reg:*:${userId}`,
  ];

  const keys = new Set();
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

  if (keys.size > 0) {
    await client.del([...keys]);
  }

  await client.quit();
  return { skipped: false, cleared: keys.size };
}

async function simulateLogin(db, email, password) {
  const users = db.collection("users");
  const user = await users.findOne(
    { email: email.toLowerCase() },
    { projection: { password: 1, isActive: 1, authProvider: 1, emailVerified: 1 } }
  );

  if (!user || !user.password) {
    throw new Error("User not found for login simulation");
  }

  if (!user.isActive) {
    throw new Error("User is inactive");
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    throw new Error("Invalid password");
  }

  if (user.authProvider === "email" && !user.emailVerified) {
    throw new Error("Email not verified");
  }
}

async function simulateFriendsRoute(db, userId) {
  const friends = db.collection("friends");
  const expenseParticipants = db.collection("expenseparticipants");
  const expenses = db.collection("expenses");
  const settlements = db.collection("settlements");

  const friendships = await friends
    .find({ $or: [{ userId }, { friendId: userId }], status: "accepted" })
    .toArray();

  const participants = await expenseParticipants
    .find({ userId, isSettled: false }, { projection: { expenseId: 1 } })
    .toArray();
  const expenseIds = [...new Set(participants.map((p) => p.expenseId?.toString()).filter(Boolean))].map(
    (id) => new ObjectId(id)
  );

  const validExpenses =
    expenseIds.length > 0
      ? await expenses
          .find({ _id: { $in: expenseIds }, isDeleted: false }, { projection: { _id: 1 } })
          .toArray()
      : [];
  const validExpenseIds = validExpenses.map((expense) => expense._id);

  const allParticipants =
    validExpenseIds.length > 0
      ? await expenseParticipants
          .find({ expenseId: { $in: validExpenseIds }, isSettled: false }, { projection: { _id: 1 } })
          .toArray()
      : [];

  const settlementsDocs = await settlements
    .find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }, { projection: { _id: 1 } })
    .toArray();

  return {
    friendships: friendships.length,
    validExpenses: validExpenses.length,
    participants: allParticipants.length,
    settlements: settlementsDocs.length,
  };
}

async function simulateGroupsRoute(db, userId) {
  const groups = db.collection("groups");
  const groupMembers = db.collection("groupmembers");

  const memberships = await groupMembers
    .find({ userId }, { projection: { groupId: 1, role: 1 } })
    .toArray();
  const groupIds = memberships.map((membership) => membership.groupId);

  const groupDocs =
    groupIds.length > 0
      ? await groups.find({ _id: { $in: groupIds }, isActive: true }).toArray()
      : [];

  const groupMemberDocs =
    groupDocs.length > 0
      ? await groupMembers
          .find({ groupId: { $in: groupDocs.map((group) => group._id) } }, { projection: { groupId: 1 } })
          .toArray()
      : [];

  return {
    groups: groupDocs.length,
    members: groupMemberDocs.length,
    groupIds: groupDocs.map((group) => group._id.toString()),
  };
}

async function simulateExpensesRoute(db, userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    groupId = null,
    startDate = null,
    endDate = null,
  } = options;

  const expenseParticipants = db.collection("expenseparticipants");
  const expenses = db.collection("expenses");

  const expenseIds = await expenseParticipants.distinct("expenseId", { userId });
  if (expenseIds.length === 0) {
    return { total: 0, expenses: 0 };
  }

  const query = {
    _id: { $in: expenseIds },
    isDeleted: false,
  };

  if (groupId) {
    query.groupId = new ObjectId(groupId);
  }
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = startDate;
    if (endDate) query.date.$lte = endDate;
  }

  const skip = (page - 1) * limit;
  const docs = await expenses
    .find(query)
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  const total = await expenses.countDocuments(query);

  return {
    total,
    expenses: docs.length,
  };
}

async function simulateDashboardActivityRoute(db, userId) {
  const expenseParticipants = db.collection("expenseparticipants");
  const expenses = db.collection("expenses");
  const settlements = db.collection("settlements");
  const friends = db.collection("friends");

  const expenseIds = await expenseParticipants.distinct("expenseId", { userId });
  const expenseDocs =
    expenseIds.length > 0
      ? await expenses
          .find({ _id: { $in: expenseIds }, isDeleted: false }, { projection: { _id: 1 } })
          .sort({ createdAt: -1 })
          .limit(12)
          .toArray()
      : [];

  const settlementDocs = await settlements
    .find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }, { projection: { _id: 1 } })
    .sort({ createdAt: -1 })
    .limit(8)
    .toArray();

  const friendDocs = await friends
    .find({ $or: [{ userId }, { friendId: userId }], status: "accepted" }, { projection: { _id: 1 } })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();

  return {
    expenses: expenseDocs.length,
    settlements: settlementDocs.length,
    friends: friendDocs.length,
  };
}

async function simulateDashboardReadFlow(db, userId) {
  const start = Date.now();
  const completionTimes = {};

  const track = (name, promise) =>
    promise.then((value) => {
      completionTimes[name] = Date.now() - start;
      return value;
    });

  const friendsPromise = track("friends", simulateFriendsRoute(db, userId));
  const groupsPromise = track("groups", simulateGroupsRoute(db, userId));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthlyPromise = track(
    "monthly",
    simulateExpensesRoute(db, userId, {
      limit: 1000,
      startDate: startOfMonth,
      endDate: endOfMonth,
    })
  );
  const activityPromise = track("activity", simulateDashboardActivityRoute(db, userId));

  const settled = await Promise.allSettled([
    friendsPromise,
    groupsPromise,
    monthlyPromise,
    activityPromise,
  ]);

  const stageOneTimes = Object.values(completionTimes);
  const firstVisibleMs = stageOneTimes.length > 0 ? Math.min(...stageOneTimes) : 0;
  const initialFullMs = stageOneTimes.length > 0 ? Math.max(...stageOneTimes) : 0;

  let groupBalanceMs = 0;
  const groupsResult = settled[1];
  if (groupsResult.status === "fulfilled" && groupsResult.value.groupIds.length > 0) {
    const groupBalanceStart = Date.now();
    await runWithConcurrency(groupsResult.value.groupIds, 3, async (groupId) =>
      simulateExpensesRoute(db, userId, { groupId, limit: 100 })
    );
    groupBalanceMs = Date.now() - groupBalanceStart;
  }

  return {
    firstVisibleMs,
    initialFullMs,
    groupBalanceMs,
    fullWithGroupBalancesMs: Date.now() - start,
  };
}

async function runSimulationPass(db, userId, email, password) {
  const login = await timed(() => simulateLogin(db, email, password));
  const friends = await timed(() => simulateFriendsRoute(db, userId));
  const groups = await timed(() => simulateGroupsRoute(db, userId));
  const expenses = await timed(() => simulateExpensesRoute(db, userId, { limit: 20 }));
  const activity = await timed(() => simulateDashboardActivityRoute(db, userId));
  const dashboardFlow = await simulateDashboardReadFlow(db, userId);

  return {
    loginMs: login.ms,
    routes: {
      "/api/friends": { ms: friends.ms, result: friends.value },
      "/api/groups": { ms: groups.ms, result: groups.value },
      "/api/expenses": { ms: expenses.ms, result: expenses.value },
      "/api/dashboard/activity": { ms: activity.ms, result: activity.value },
    },
    dashboardFlow,
  };
}

async function loginHttp(baseUrl, email, password) {
  const jar = new CookieJar();
  const start = Date.now();

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: "GET",
    redirect: "manual",
    headers: jar.toHeaders(),
  });
  jar.absorb(csrfResponse.headers);
  if (!csrfResponse.ok) {
    throw new Error(`Failed to fetch CSRF token (${csrfResponse.status})`);
  }
  const csrfPayload = await csrfResponse.json();

  const body = new URLSearchParams({
    csrfToken: csrfPayload.csrfToken,
    email,
    password,
    rememberMe: "false",
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true",
  });

  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials?json=true`, {
    method: "POST",
    redirect: "manual",
    headers: jar.toHeaders({
      "Content-Type": "application/x-www-form-urlencoded",
    }),
    body: body.toString(),
  });
  jar.absorb(loginResponse.headers);

  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: jar.toHeaders(),
  });
  if (!sessionResponse.ok) {
    throw new Error(`Login did not create a session (${sessionResponse.status})`);
  }
  const sessionJson = await sessionResponse.json();
  if (!sessionJson?.user?.email) {
    throw new Error("Session payload missing user information");
  }

  return {
    jar,
    loginMs: Date.now() - start,
  };
}

async function timedHttpJson(baseUrl, jar, route) {
  const start = Date.now();
  const response = await fetch(`${baseUrl}${route}`, {
    headers: jar.toHeaders(),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    ms: Date.now() - start,
    status: response.status,
    ok: response.ok,
    cache: response.headers.get("x-doosplit-cache"),
    routeMsHeader: response.headers.get("x-doosplit-route-ms"),
    json,
  };
}

async function runHttpDashboardFlow(baseUrl, jar) {
  const start = Date.now();
  const sectionTimes = {};

  const track = (name, promise) =>
    promise.then((value) => {
      sectionTimes[name] = Date.now() - start;
      return value;
    });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

  const friendsPromise = track("friends", timedHttpJson(baseUrl, jar, "/api/friends"));
  const groupsPromise = track("groups", timedHttpJson(baseUrl, jar, "/api/groups"));
  const monthlyPromise = track(
    "monthly",
    timedHttpJson(
      baseUrl,
      jar,
      `/api/expenses?startDate=${encodeURIComponent(startOfMonth)}&endDate=${encodeURIComponent(
        endOfMonth
      )}&limit=1000`
    )
  );
  const activityPromise = track("activity", timedHttpJson(baseUrl, jar, "/api/dashboard/activity"));

  const settled = await Promise.allSettled([
    friendsPromise,
    groupsPromise,
    monthlyPromise,
    activityPromise,
  ]);

  const firstVisibleMs =
    Object.values(sectionTimes).length > 0 ? Math.min(...Object.values(sectionTimes)) : 0;

  let groupBalanceMs = 0;
  const groupsResult = settled[1];
  if (groupsResult.status === "fulfilled" && groupsResult.value.ok) {
    const groups = groupsResult.value.json?.groups || [];
    if (Array.isArray(groups) && groups.length > 0) {
      const groupBalanceStart = Date.now();
      await runWithConcurrency(groups, 3, async (group) =>
        timedHttpJson(baseUrl, jar, `/api/expenses?groupId=${group._id}&limit=100`)
      );
      groupBalanceMs = Date.now() - groupBalanceStart;
    }
  }

  return {
    firstVisibleMs,
    initialFullMs:
      Object.values(sectionTimes).length > 0 ? Math.max(...Object.values(sectionTimes)) : 0,
    groupBalanceMs,
    fullWithGroupBalancesMs: Date.now() - start,
  };
}

async function runHttpPass(baseUrl, email, password) {
  const { jar, loginMs } = await loginHttp(baseUrl, email, password);
  const friends = await timedHttpJson(baseUrl, jar, "/api/friends");
  const groups = await timedHttpJson(baseUrl, jar, "/api/groups");
  const expenses = await timedHttpJson(baseUrl, jar, "/api/expenses?limit=20");
  const activity = await timedHttpJson(baseUrl, jar, "/api/dashboard/activity");
  const dashboardFlow = await runHttpDashboardFlow(baseUrl, jar);

  return {
    loginMs,
    routes: {
      "/api/friends": friends,
      "/api/groups": groups,
      "/api/expenses": expenses,
      "/api/dashboard/activity": activity,
    },
    dashboardFlow,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"];
  const baseUrl = args["base-url"] || process.env.PERF_BASE_URL;
  const emailArg = args.email;
  const passwordArg = args.password;

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

  const client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db();

  const users = db.collection("users");
  const perfTag = `PERF_${runId}`;
  const user =
    (await users.findOne({ perfTag, email: new RegExp(`^perf_${runId}_main@`, "i") })) ||
    (await users.findOne({ perfTag }));

  if (!user) {
    throw new Error(
      `No seeded perf user found for run "${runId}". Run scripts/perf/seed-test-data.js first.`
    );
  }

  const userId = user._id;
  const email = emailArg || user.email;
  const password = passwordArg || "Perf@12345";

  const redisCleanupCold = await clearRedisUserKeys(env, userId.toString());
  const simulationCold = await runSimulationPass(db, userId, email, password);
  const simulationWarm = await runSimulationPass(db, userId, email, password);

  let http = null;
  if (baseUrl) {
    try {
      await clearRedisUserKeys(env, userId.toString());
      const cold = await runHttpPass(baseUrl, email, password);
      const warm = await runHttpPass(baseUrl, email, password);
      http = { baseUrl, cold, warm };
    } catch (httpError) {
      http = {
        baseUrl,
        error: httpError.message,
      };
    }
  }

  await client.close();

  console.log(
    JSON.stringify(
      {
        runId,
        perfTag,
        userId: userId.toString(),
        email,
        timestamp: new Date().toISOString(),
        cacheReset: {
          coldPass: redisCleanupCold,
        },
        simulation: {
          cold: simulationCold,
          warm: simulationWarm,
        },
        http,
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

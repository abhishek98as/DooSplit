#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

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

function ago(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function rid(runId, type, index) {
  return `seed_${runId}_${type}_${index}`;
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function upsertTable(supabase, table, rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = args["run-id"] || `seed-${Date.now()}`;

  const env = {
    ...loadEnv(path.resolve(".env.local")),
    ...process.env,
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const password = "Test@1234";
  const hashedPassword = await bcrypt.hash(password, 10);

  const users = [
    {
      id: rid(runId, "user", 1),
      email: `seed_${runId}_alice@example.com`,
      password: hashedPassword,
      name: "Alice",
      default_currency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      is_active: true,
      is_dummy: false,
      role: "admin",
      email_verified: true,
      auth_provider: "email",
      created_at: ago(90),
      updated_at: ago(1),
    },
    {
      id: rid(runId, "user", 2),
      email: `seed_${runId}_bob@example.com`,
      password: hashedPassword,
      name: "Bob",
      default_currency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      is_active: true,
      is_dummy: false,
      role: "user",
      email_verified: true,
      auth_provider: "email",
      created_at: ago(80),
      updated_at: ago(1),
    },
    {
      id: rid(runId, "user", 3),
      email: `seed_${runId}_charlie@example.com`,
      password: hashedPassword,
      name: "Charlie",
      default_currency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      is_active: true,
      is_dummy: false,
      role: "user",
      email_verified: true,
      auth_provider: "email",
      created_at: ago(70),
      updated_at: ago(1),
    },
    {
      id: rid(runId, "user", 4),
      email: `seed_${runId}_dummy_${randomToken()}@example.local`,
      password: null,
      name: "Dummy Contact",
      default_currency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      is_active: true,
      is_dummy: true,
      created_by: rid(runId, "user", 1),
      role: "user",
      email_verified: false,
      auth_provider: "email",
      created_at: ago(30),
      updated_at: ago(1),
    },
  ];

  const groups = [
    {
      id: rid(runId, "group", 1),
      name: "Goa Trip",
      description: "Trip split",
      image: null,
      type: "trip",
      currency: "INR",
      created_by: rid(runId, "user", 1),
      is_active: true,
      created_at: ago(20),
      updated_at: ago(2),
    },
    {
      id: rid(runId, "group", 2),
      name: "Home",
      description: "Monthly home expenses",
      image: null,
      type: "home",
      currency: "INR",
      created_by: rid(runId, "user", 2),
      is_active: true,
      created_at: ago(40),
      updated_at: ago(2),
    },
  ];

  const groupMembers = [
    { id: rid(runId, "gm", 1), group_id: rid(runId, "group", 1), user_id: rid(runId, "user", 1), role: "admin", joined_at: ago(20), created_at: ago(20), updated_at: ago(20) },
    { id: rid(runId, "gm", 2), group_id: rid(runId, "group", 1), user_id: rid(runId, "user", 2), role: "member", joined_at: ago(19), created_at: ago(19), updated_at: ago(19) },
    { id: rid(runId, "gm", 3), group_id: rid(runId, "group", 1), user_id: rid(runId, "user", 3), role: "member", joined_at: ago(18), created_at: ago(18), updated_at: ago(18) },
    { id: rid(runId, "gm", 4), group_id: rid(runId, "group", 2), user_id: rid(runId, "user", 2), role: "admin", joined_at: ago(40), created_at: ago(40), updated_at: ago(40) },
    { id: rid(runId, "gm", 5), group_id: rid(runId, "group", 2), user_id: rid(runId, "user", 1), role: "member", joined_at: ago(39), created_at: ago(39), updated_at: ago(39) },
  ];

  const friendships = [
    { id: rid(runId, "friend", 1), user_id: rid(runId, "user", 1), friend_id: rid(runId, "user", 2), status: "accepted", requested_by: rid(runId, "user", 1), created_at: ago(50), updated_at: ago(49) },
    { id: rid(runId, "friend", 2), user_id: rid(runId, "user", 2), friend_id: rid(runId, "user", 1), status: "accepted", requested_by: rid(runId, "user", 1), created_at: ago(50), updated_at: ago(49) },
    { id: rid(runId, "friend", 3), user_id: rid(runId, "user", 1), friend_id: rid(runId, "user", 3), status: "pending", requested_by: rid(runId, "user", 3), created_at: ago(4), updated_at: ago(4) },
    { id: rid(runId, "friend", 4), user_id: rid(runId, "user", 3), friend_id: rid(runId, "user", 1), status: "pending", requested_by: rid(runId, "user", 3), created_at: ago(4), updated_at: ago(4) },
  ];

  const expenses = [
    { id: rid(runId, "expense", 1), amount: 12000, description: "Hotel booking", category: "accommodation", date: ago(12), currency: "INR", created_by: rid(runId, "user", 1), group_id: rid(runId, "group", 1), images: [], notes: "2 nights", is_deleted: false, edit_history: [], created_at: ago(12), updated_at: ago(12) },
    { id: rid(runId, "expense", 2), amount: 3000, description: "Dinner", category: "food", date: ago(10), currency: "INR", created_by: rid(runId, "user", 2), group_id: rid(runId, "group", 1), images: [], notes: null, is_deleted: false, edit_history: [], created_at: ago(10), updated_at: ago(10) },
    { id: rid(runId, "expense", 3), amount: 24000, description: "Monthly rent", category: "rent", date: ago(6), currency: "INR", created_by: rid(runId, "user", 2), group_id: rid(runId, "group", 2), images: [], notes: "Flat rent", is_deleted: false, edit_history: [], created_at: ago(6), updated_at: ago(6) },
    { id: rid(runId, "expense", 4), amount: 800, description: "Cab", category: "transport", date: ago(2), currency: "INR", created_by: rid(runId, "user", 1), group_id: null, images: [], notes: "Shared ride", is_deleted: false, edit_history: [], created_at: ago(2), updated_at: ago(2) },
  ];

  const expenseParticipants = [
    { id: rid(runId, "ep", 1), expense_id: rid(runId, "expense", 1), user_id: rid(runId, "user", 1), paid_amount: 12000, owed_amount: 4000, is_settled: false, created_at: ago(12), updated_at: ago(12) },
    { id: rid(runId, "ep", 2), expense_id: rid(runId, "expense", 1), user_id: rid(runId, "user", 2), paid_amount: 0, owed_amount: 4000, is_settled: false, created_at: ago(12), updated_at: ago(12) },
    { id: rid(runId, "ep", 3), expense_id: rid(runId, "expense", 1), user_id: rid(runId, "user", 3), paid_amount: 0, owed_amount: 4000, is_settled: false, created_at: ago(12), updated_at: ago(12) },
    { id: rid(runId, "ep", 4), expense_id: rid(runId, "expense", 2), user_id: rid(runId, "user", 1), paid_amount: 0, owed_amount: 1000, is_settled: false, created_at: ago(10), updated_at: ago(10) },
    { id: rid(runId, "ep", 5), expense_id: rid(runId, "expense", 2), user_id: rid(runId, "user", 2), paid_amount: 3000, owed_amount: 1000, is_settled: false, created_at: ago(10), updated_at: ago(10) },
    { id: rid(runId, "ep", 6), expense_id: rid(runId, "expense", 2), user_id: rid(runId, "user", 3), paid_amount: 0, owed_amount: 1000, is_settled: false, created_at: ago(10), updated_at: ago(10) },
    { id: rid(runId, "ep", 7), expense_id: rid(runId, "expense", 3), user_id: rid(runId, "user", 1), paid_amount: 0, owed_amount: 12000, is_settled: false, created_at: ago(6), updated_at: ago(6) },
    { id: rid(runId, "ep", 8), expense_id: rid(runId, "expense", 3), user_id: rid(runId, "user", 2), paid_amount: 24000, owed_amount: 12000, is_settled: false, created_at: ago(6), updated_at: ago(6) },
    { id: rid(runId, "ep", 9), expense_id: rid(runId, "expense", 4), user_id: rid(runId, "user", 1), paid_amount: 800, owed_amount: 400, is_settled: false, created_at: ago(2), updated_at: ago(2) },
    { id: rid(runId, "ep", 10), expense_id: rid(runId, "expense", 4), user_id: rid(runId, "user", 2), paid_amount: 0, owed_amount: 400, is_settled: false, created_at: ago(2), updated_at: ago(2) },
  ];

  const settlements = [
    { id: rid(runId, "settlement", 1), from_user_id: rid(runId, "user", 2), to_user_id: rid(runId, "user", 1), amount: 2500, currency: "INR", method: "upi", note: "Partial trip settlement", screenshot: null, date: ago(3), group_id: rid(runId, "group", 1), version: 1, last_modified: ago(3), modified_by: rid(runId, "user", 2), created_at: ago(3), updated_at: ago(3) },
  ];

  const notifications = [
    { id: rid(runId, "notif", 1), user_id: rid(runId, "user", 1), type: "friend_request", message: "Charlie sent a friend request", data: { fromUserId: rid(runId, "user", 3), fromName: "Charlie" }, is_read: false, created_at: ago(4), updated_at: ago(4) },
    { id: rid(runId, "notif", 2), user_id: rid(runId, "user", 2), type: "expense_added", message: "Alice added Hotel booking", data: { expenseId: rid(runId, "expense", 1) }, is_read: true, created_at: ago(12), updated_at: ago(11) },
  ];

  const invitations = [
    { id: rid(runId, "invite", 1), invited_by: rid(runId, "user", 1), email: `seed_${runId}_invitee@example.com`, token: randomToken(), status: "pending", expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), created_at: ago(1), updated_at: ago(1) },
  ];

  const reminders = [
    { id: rid(runId, "reminder", 1), from_user_id: rid(runId, "user", 2), to_user_id: rid(runId, "user", 1), amount: 1200, currency: "INR", message: "Please settle this week", status: "sent", sent_at: ago(1), read_at: null, paid_at: null, created_at: ago(1), updated_at: ago(1) },
  ];

  await upsertTable(supabase, "users", users);
  await upsertTable(supabase, "friendships", friendships);
  await upsertTable(supabase, "groups", groups);
  await upsertTable(supabase, "group_members", groupMembers);
  await upsertTable(supabase, "expenses", expenses);
  await upsertTable(supabase, "expense_participants", expenseParticipants);
  await upsertTable(supabase, "settlements", settlements);
  await upsertTable(supabase, "notifications", notifications);
  await upsertTable(supabase, "invitations", invitations);
  await upsertTable(supabase, "payment_reminders", reminders);

  const seedInfo = {
    runId,
    credentials: {
      email: users[0].email,
      password,
    },
    users: users.map((user) => ({ id: user.id, email: user.email, name: user.name })),
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
  };

  const outPath = path.resolve("docs", "migration", "seed-info.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(seedInfo, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        seeded: {
          users: users.length,
          friendships: friendships.length,
          groups: groups.length,
          groupMembers: groupMembers.length,
          expenses: expenses.length,
          expenseParticipants: expenseParticipants.length,
          settlements: settlements.length,
          notifications: notifications.length,
          invitations: invitations.length,
          reminders: reminders.length,
        },
        seedInfoPath: outPath,
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

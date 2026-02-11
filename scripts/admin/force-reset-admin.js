#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

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

async function main() {
  const env = {
    ...loadEnv(path.resolve(".env.local")),
    ...process.env,
  };

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const adminEmail = "abhishek98as@gmail.com";
  const adminPassword = "Abhi@1357#";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const client = new MongoClient(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db();

  const users = db.collection("users");
  const result = await users.updateOne(
    { email: adminEmail.toLowerCase() },
    {
      $set: {
        password: passwordHash,
        name: "Admin",
        role: "admin",
        isActive: true,
        emailVerified: true,
        authProvider: "email",
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  await client.close();

  console.log(
    JSON.stringify(
      {
        email: adminEmail,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});

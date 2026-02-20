const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (process.env[key] !== undefined) {
      continue;
    }

    let value = match[2];
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1).replace(/\\n/g, "\n");
    }
    process.env[key] = value;
  }
}

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
}

function getDatabaseId() {
  return (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
    "(default)"
  );
}

function initApp() {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID is required");
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      projectId,
    });
  }

  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      projectId,
    });
  }

  return initializeApp({ projectId });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

async function run() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const app = initApp();
  const db = getFirestore(app, getDatabaseId());
  const snapshot = await db.collection("users").get();

  let inspected = 0;
  let updated = 0;
  let batchOps = 0;
  let batch = db.batch();
  const nowIso = new Date().toISOString();

  for (const doc of snapshot.docs) {
    inspected += 1;
    const row = doc.data() || {};
    const nextEmail = normalizeEmail(row.email || "");
    const nextName = normalizeName(row.name || "User");

    if (
      String(row.email_normalized || "") === nextEmail &&
      String(row.name_normalized || "") === nextName
    ) {
      continue;
    }

    batch.set(
      doc.ref,
      {
        email_normalized: nextEmail,
        name_normalized: nextName,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    updated += 1;
    batchOps += 1;

    if (batchOps >= 400) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        inspected,
        updated,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
});


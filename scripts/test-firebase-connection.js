const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

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

loadEnvFile(".env.local");
loadEnvFile(".env");

function getProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
}

function getDatabaseId() {
  return (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
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

async function run() {
  const app = initApp();
  const databaseId = getDatabaseId();
  const db = getFirestore(app, databaseId);
  const auth = getAuth(app);

  const checkId = `check_${Date.now()}`;
  const ref = db.collection("__health_checks").doc(checkId);

  await ref.set({
    id: checkId,
    status: "ok",
    created_at: new Date().toISOString(),
  });

  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error("Firestore write/read validation failed");
  }

  await ref.delete();

  const users = await auth.listUsers(1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        firestore: "write-read-delete success",
        databaseId,
        auth: "listUsers success",
        sampleUsersReturned: users.users.length,
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
        databaseId: getDatabaseId(),
        error: error.message,
      },
      null,
      2
    )
  );
  process.exit(1);
});

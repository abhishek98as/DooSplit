/**
 * Firestore → MongoDB Data Migration Script
 *
 * Reads all data from Firebase Firestore and writes to MongoDB Atlas.
 * Supports incremental re-runs via migration-state.json tracking.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migrate-firestore-to-mongodb.ts
 *
 * Requires: MONGODB_URI + MONGODB_PASSWORD (or full URI in MONGODB_URI)
 *           Firebase Admin SDK credentials (service account)
 */

import "dotenv/config";
import mongoose from "mongoose";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// ── Configuration ──

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || "";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "doosplit";

const STATE_FILE = path.join(__dirname, "migration-state.json");
const REPORT_FILE = path.join(__dirname, "migration-report.json");

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set. Set it in .env.local");
  process.exit(1);
}

// Resolve URI with password
function resolveMongoUri(): string {
  let uri = MONGODB_URI;
  if (uri.includes("<db_password>") && MONGODB_PASSWORD) {
    uri = uri.replace("<db_password>", encodeURIComponent(MONGODB_PASSWORD));
  }
  return uri;
}

// ── State Tracking ──

interface CollectionState {
  done: boolean;
  count: number;
  lastId?: string;
}

interface MigrationState {
  [collection: string]: CollectionState;
}

function loadState(): MigrationState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

function saveState(state: MigrationState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Collections to migrate (in dependency order) ──

const COLLECTIONS = [
  "users",
  "friendships",
  "groups",
  "group_members",
  "expenses",
  "expense_participants",
  "expense_comments",
  "settlements",
  "settlement_allocations",
  "payment_reminders",
  "notifications",
  "invitations",
  "recurring_expense_templates",
  "recurring_expense_runs",
  "user_nudge_states",
  "activity_logs",
  "feature_feedback",
] as const;

// ── Type Conversion ──

function convertFirestoreDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = doc.data() || {};
  const converted: Record<string, unknown> = { _id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    // Convert Firestore Timestamps to JS Dates
    if (value && typeof value === "object" && "_seconds" in value) {
      converted[key] = new Date((value as any)._seconds * 1000);
    } else if (value && typeof value === "object" && "toDate" in value) {
      converted[key] = (value as any).toDate();
    } else if (key === "id" && typeof value === "string") {
      // Keep doc.id as _id, but also store the id field
      converted.id = value;
    } else {
      converted[key] = value;
    }
  }

  return converted;
}

// ── Main Migration ──

async function migrate() {
  console.log("🚀 Starting Firestore → MongoDB migration...\n");

  const report: Record<string, { source: number; migrated: number; errors: number; durationMs: number }> = {};

  // 1. Connect to Firestore
  console.log("📡 Connecting to Firestore...");
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
    } else {
      initializeApp();
    }
  }
  const firestore = getFirestore();
  console.log("✅ Firestore connected\n");

  // 2. Connect to MongoDB
  console.log("📡 Connecting to MongoDB Atlas...");
  const uri = resolveMongoUri();
  await mongoose.connect(uri, {
    dbName: MONGODB_DB_NAME,
    serverApi: { version: "1" as const, strict: true, deprecationErrors: true },
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
  });
  const mongoDb = mongoose.connection.db;
  console.log("✅ MongoDB connected\n");

  // 3. Load state
  const state = loadState();

  // 4. Migrate each collection
  for (const collectionName of COLLECTIONS) {
    const collectionState = state[collectionName] || { done: false, count: 0 };

    if (collectionState.done) {
      console.log(`⏭️  ${collectionName}: already migrated (${collectionState.count} docs)`);
      report[collectionName] = { source: collectionState.count, migrated: 0, errors: 0, durationMs: 0 };
      continue;
    }

    const startTime = Date.now();
    console.log(`📦 Migrating: ${collectionName}...`);

    let sourceCount = 0;
    let migratedCount = 0;
    let errorCount = 0;

    try {
      // Count Firestore docs
      const countSnap = await firestore.collection(collectionName).count().get();
      sourceCount = countSnap.data().count;
      console.log(`   Source: ${sourceCount} docs`);

      if (sourceCount === 0) {
        state[collectionName] = { done: true, count: 0 };
        saveState(state);
        report[collectionName] = { source: 0, migrated: 0, errors: 0, durationMs: Date.now() - startTime };
        console.log(`   ✅ Skipped (0 docs)\n`);
        continue;
      }

      // Fetch in batches of 500
      const mongoCollection = mongoDb.collection(collectionName);
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

      while (true) {
        let query = firestore.collection(collectionName).limit(500);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) break;

        const docs = snapshot.docs.map(convertFirestoreDoc);

        try {
          await mongoCollection.insertMany(docs, { ordered: false });
          migratedCount += docs.length;
        } catch (err: any) {
          // Some docs may fail (e.g., duplicate _id); log and continue
          if (err.writeErrors) {
            const inserted = docs.length - err.writeErrors.length;
            migratedCount += inserted;
            errorCount += err.writeErrors.length;
            console.log(`   ⚠️  Batch: ${inserted} inserted, ${err.writeErrors.length} skipped`);
          } else {
            throw err;
          }
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        console.log(`   Progress: ${migratedCount}/${sourceCount}`);

        if (snapshot.docs.length < 500) break;
      }

      // Mark collection as done
      state[collectionName] = { done: true, count: migratedCount, lastId: lastDoc?.id };
      saveState(state);

      const durationMs = Date.now() - startTime;
      report[collectionName] = { source: sourceCount, migrated: migratedCount, errors: errorCount, durationMs };
      console.log(`   ✅ Done: ${migratedCount} migrated, ${errorCount} errors (${(durationMs / 1000).toFixed(1)}s)\n`);
    } catch (err: any) {
      console.error(`   ❌ Failed: ${err?.message}`);
      report[collectionName] = {
        source: sourceCount,
        migrated: migratedCount,
        errors: errorCount + 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 5. Verify counts
  console.log("\n📊 Verification Report:\n");
  console.log("Collection".padEnd(35) + "Source".padStart(8) + "Migrated".padStart(10) + "Errors".padStart(8));
  console.log("-".repeat(61));

  let totalSource = 0;
  let totalMigrated = 0;
  let totalErrors = 0;

  for (const [name, stats] of Object.entries(report)) {
    console.log(
      name.padEnd(35) +
        String(stats.source).padStart(8) +
        String(stats.migrated).padStart(10) +
        String(stats.errors).padStart(8)
    );
    totalSource += stats.source;
    totalMigrated += stats.migrated;
    totalErrors += stats.errors;
  }

  console.log("-".repeat(61));
  console.log(
    "TOTAL".padEnd(35) +
      String(totalSource).padStart(8) +
      String(totalMigrated).padStart(10) +
      String(totalErrors).padStart(8)
  );

  // 6. Save report
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ collections: report, totals: { totalSource, totalMigrated, totalErrors } }, null, 2));
  console.log(`\n📄 Report saved to: ${REPORT_FILE}\n`);

  // Cleanup
  await mongoose.disconnect();
  console.log("🎉 Migration complete!");
}

migrate().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});

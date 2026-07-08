import { NextResponse } from "next/server";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getDataBackendMode } from "@/lib/data/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const dataBackend = getDataBackendMode();

  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    backend: dataBackend,
  };

  checks.envVars = {
    FIREBASE_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    FIREBASE_API_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    FIREBASE_STORAGE_BUCKET: Boolean(
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    ),
    FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_SERVICE_ACCOUNT_KEY: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
    FIREBASE_SESSION_COOKIE_NAME: Boolean(process.env.FIREBASE_SESSION_COOKIE_NAME),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    MONGODB_URI: Boolean(process.env.MONGODB_URI),
  };

  // Redis has been removed — caching is now in-process memory only.
  checks.redis = { status: "disabled", message: "Redis removed — using in-process memory cache" };

  checks.firebaseAuth = {
    initialized: Boolean(adminAuth),
    error: firebaseInitError || null,
  };

  // Ping the active data backend instead of always hitting Firestore.
  // DATA_BACKEND=mongodb → ping MongoDB; firestore → ping Firestore; dynamodb → skip ping.
  if (dataBackend === "mongodb") {
    try {
      const { getMongoDb } = await import("@/lib/mongodb/client");
      const start = Date.now();
      await getMongoDb();
      checks.mongodb = { status: "connected", pingMs: Date.now() - start };
    } catch (error: any) {
      checks.mongodb = { status: "error", error: error.message };
    }
  } else if (dataBackend === "firestore") {
    try {
      const { getAdminDb } = await import("@/lib/firestore/admin");
      const db = getAdminDb();
      const start = Date.now();
      await db.collection("users").limit(1).get();
      checks.firestore = { status: "connected", pingMs: Date.now() - start };
    } catch (error: any) {
      checks.firestore = { status: "error", error: error.message };
    }
  } else if (dataBackend === "dynamodb") {
    checks.dynamodb = { status: "not-checked", message: "DynamoDB ping not implemented in health check" };
  }

  const dbCheck =
    dataBackend === "mongodb"
      ? checks.mongodb?.status === "connected"
      : dataBackend === "firestore"
      ? checks.firestore?.status === "connected"
      : true; // dynamodb: skip

  const isHealthy = checks.firebaseAuth.initialized && dbCheck;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

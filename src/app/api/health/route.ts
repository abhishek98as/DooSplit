import { NextResponse } from "next/server";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getRedisClient } from "@/lib/redis";
import { getAdminDb } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    backend: "firebase",
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
    REDIS_URL: Boolean(process.env.REDIS_URL),
  };

  try {
    const startTime = Date.now();
    const redisPromise = (async () => {
      const redis = await getRedisClient();
      if (redis?.isOpen) {
        await redis.ping();
        return { status: "connected", pingMs: Date.now() - startTime };
      }
      return { status: "disabled", message: "Redis not configured" };
    })();
    const timeout = new Promise<{ status: string; message: string }>((resolve) =>
      setTimeout(() => resolve({ status: "timeout", message: "Redis connection timed out (8s)" }), 8000)
    );
    checks.redis = await Promise.race([redisPromise, timeout]);
  } catch (error: any) {
    checks.redis = {
      status: "error",
      error: error.message,
      message: "Redis connection failed",
    };
  }

  checks.firebaseAuth = {
    initialized: Boolean(adminAuth),
    error: firebaseInitError || null,
  };

  try {
    const db = getAdminDb();
    const start = Date.now();
    await db.collection("users").limit(1).get();
    checks.firestore = {
      status: "connected",
      pingMs: Date.now() - start,
    };
  } catch (error: any) {
    checks.firestore = {
      status: "error",
      error: error.message,
    };
  }

  const isHealthy = checks.firebaseAuth.initialized && checks.firestore?.status === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

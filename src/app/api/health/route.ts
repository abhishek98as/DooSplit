import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
  };

  // Check environment variables
  checks.envVars = {
    MONGODB_URI: !!process.env.MONGODB_URI,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    ADMIN_EMAIL: !!process.env.ADMIN_EMAIL,
    REDIS_URL: !!process.env.REDIS_URL,
    REDIS_HOST: !!process.env.REDIS_HOST,
  };

  // Check MongoDB connection
  try {
    const startTime = Date.now();
    const mongoose = await dbConnect();
    const pingTime = Date.now() - startTime;

    checks.mongodb = {
      status: "connected",
      pingMs: pingTime,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      dbName: mongoose.connection.db?.databaseName,
    };
  } catch (error: any) {
    checks.mongodb = {
      status: "error",
      error: error.message,
      code: error.code,
    };
  }

  // Check Redis connection
  try {
    const startTime = Date.now();
    const redis = await getRedisClient();
    
    if (redis?.isOpen) {
      await redis.ping();
      const pingTime = Date.now() - startTime;
      
      checks.redis = {
        status: "connected",
        pingMs: pingTime,
        message: "Redis cache is active and operational",
      };
    } else {
      checks.redis = {
        status: "disabled",
        message: "Redis not configured - app running without cache (slower performance)",
      };
    }
  } catch (error: any) {
    checks.redis = {
      status: "error",
      error: error.message,
      message: "Redis connection failed - app running without cache (slower performance)",
    };
  }

  // Check Firebase Admin SDK
  checks.firebaseAdmin = {
    initialized: !!adminAuth,
    error: firebaseInitError || null,
    canVerifyTokens: !!adminAuth && (!!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || !!process.env.FIREBASE_PRIVATE_KEY),
  };

  // Overall status
  const isHealthy =
    checks.mongodb?.status === "connected" &&
    !!process.env.NEXTAUTH_SECRET &&
    !!process.env.MONGODB_URI;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

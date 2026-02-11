import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getRedisClient } from "@/lib/redis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDataBackendMode, getDataWriteMode } from "@/lib/data";

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
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: !!process.env.SUPABASE_JWT_SECRET,
    DATA_BACKEND_MODE: process.env.DATA_BACKEND_MODE || "mongo",
    DATA_WRITE_MODE: process.env.DATA_WRITE_MODE || "single",
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

  // Check Supabase connection
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      checks.supabase = {
        status: "disabled",
        message: "Supabase service role is not configured",
      };
    } else {
      const startTime = Date.now();
      const { error } = await supabase.from("users").select("id").limit(1);
      if (error) {
        checks.supabase = {
          status: "error",
          error: error.message,
        };
      } else {
        checks.supabase = {
          status: "connected",
          pingMs: Date.now() - startTime,
        };
      }
    }
  } catch (error: any) {
    checks.supabase = {
      status: "error",
      error: error.message,
    };
  }

  checks.dataRouting = {
    backendMode: getDataBackendMode(),
    writeMode: getDataWriteMode(),
  };

  // Overall status depends on current data routing mode.
  const backendMode = getDataBackendMode();
  const hasAuthSecret = !!process.env.NEXTAUTH_SECRET;

  const isHealthy =
    backendMode === "supabase"
      ? checks.supabase?.status === "connected" && hasAuthSecret
      : backendMode === "shadow"
      ? checks.mongodb?.status === "connected" &&
        checks.supabase?.status === "connected" &&
        hasAuthSecret
      : checks.mongodb?.status === "connected" && hasAuthSecret;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

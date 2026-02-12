import { NextResponse } from "next/server";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getRedisClient } from "@/lib/redis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    database: "supabase-postgresql",
  };

  checks.envVars = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    REDIS_URL: !!process.env.REDIS_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: !!process.env.SUPABASE_JWT_SECRET,
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
      message: "Redis connection failed - running without Redis cache",
    };
  }

  checks.firebaseAdmin = {
    initialized: !!adminAuth,
    error: firebaseInitError || null,
    canVerifyTokens:
      !!adminAuth &&
      (!!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || !!process.env.FIREBASE_PRIVATE_KEY),
  };

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

  const hasSessionSecret =
    !!process.env.NEXTAUTH_SECRET || !!process.env.SUPABASE_JWT_SECRET;
  const isHealthy = checks.supabase?.status === "connected" && hasSessionSecret;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

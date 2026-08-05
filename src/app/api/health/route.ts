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
    AWS_REGION: Boolean(process.env.AWS_REGION),
    DYNAMODB_TABLE: Boolean(process.env.DYNAMODB_TABLE),
  };

  checks.redis = { status: "disabled", message: "Redis removed — using in-process memory cache" };

  checks.firebaseAuth = {
    initialized: Boolean(adminAuth),
    error: firebaseInitError || null,
  };

  try {
    const { getDynamoDB } = await import("@/lib/dynamodb/client");
    const { TABLE } = await import("@/lib/dynamodb/tables");
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const start = Date.now();
    await getDynamoDB().send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: "__health__", SK: "__ping__" },
      })
    );
    checks.dynamodb = { status: "connected", pingMs: Date.now() - start };
  } catch (error: any) {
    checks.dynamodb = { status: "error", error: error.message };
  }

  const dbCheck = checks.dynamodb?.status === "connected";
  const isHealthy = checks.firebaseAuth.initialized && dbCheck;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

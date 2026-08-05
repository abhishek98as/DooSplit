import { NextRequest, NextResponse } from "next/server";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getDataBackendMode } from "@/lib/data/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isDetailedDiagnosticsAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ENABLE_TEST_SERVICES !== "true") return false;
  const secret = process.env.TEST_SERVICES_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const dataBackend = getDataBackendMode();
  const detailed = isDetailedDiagnosticsAllowed(request);

  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    backend: dataBackend,
  };

  if (detailed) {
    checks.nodeVersion = process.version;
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
  }

  checks.firebaseAuth = {
    initialized: Boolean(adminAuth),
    ...(detailed ? { error: firebaseInitError || null } : {}),
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    checks.dynamodb = {
      status: "error",
      ...(detailed ? { error: message } : {}),
    };
  }

  const dynamo = checks.dynamodb as { status?: string } | undefined;
  const firebase = checks.firebaseAuth as { initialized?: boolean };
  const isHealthy = Boolean(firebase.initialized) && dynamo?.status === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      ...checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

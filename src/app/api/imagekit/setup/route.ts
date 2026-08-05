import { NextRequest, NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

function isDiagnosticsAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_SERVICES !== "true") {
    return false;
  }
  const secret = process.env.TEST_SERVICES_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function resolveStorageState() {
  const storage = getAdminStorage();
  const explicitBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const bucket = explicitBucket ? storage.bucket(explicitBucket) : storage.bucket();

  const [files] = await bucket.getFiles({
    prefix: "doosplit/",
    autoPaginate: false,
    maxResults: 1,
  });

  return {
    bucket: bucket.name,
    reachable: true,
    hasDooSplitFiles: files.length > 0,
  };
}

export async function GET(request: NextRequest) {
  if (!isDiagnosticsAllowed(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const storage = await resolveStorageState();
    return NextResponse.json({
      success: true,
      provider: "firebase",
      storage,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to get storage diagnostics";
    return NextResponse.json(
      {
        success: false,
        provider: "firebase",
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isDiagnosticsAllowed(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const storage = await resolveStorageState();
    return NextResponse.json({
      success: true,
      provider: "firebase",
      message: "Firebase Storage is active for image uploads",
      storage,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to verify Firebase Storage";
    return NextResponse.json(
      {
        success: false,
        provider: "firebase",
        error: message,
      },
      { status: 500 }
    );
  }
}

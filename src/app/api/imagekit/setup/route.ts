import { NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const storage = await resolveStorageState();
    return NextResponse.json({
      success: true,
      provider: "firebase",
      storage,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        provider: "firebase",
        error: error?.message || "Failed to get storage diagnostics",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const storage = await resolveStorageState();
    return NextResponse.json({
      success: true,
      provider: "firebase",
      message: "Firebase Storage is active for image uploads",
      storage,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        provider: "firebase",
        error: error?.message || "Failed to verify Firebase Storage",
      },
      { status: 500 }
    );
  }
}

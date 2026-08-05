import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAccountDetails } from "@/lib/firebase-account";

function isDiagnosticsAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_SERVICES !== "true") {
    return false;
  }
  const secret = process.env.TEST_SERVICES_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isDiagnosticsAllowed(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const details = await getFirebaseAccountDetails();
    return NextResponse.json(details);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load Firebase account details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

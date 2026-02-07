import { NextResponse } from "next/server";
import { getCsrfTokenResponse } from "@/lib/csrf";

export const dynamic = "force-dynamic";

/**
 * GET /api/csrf-token - Get a CSRF token
 */
export async function GET() {
  return getCsrfTokenResponse();
}

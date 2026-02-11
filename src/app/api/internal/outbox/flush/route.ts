import { NextRequest, NextResponse } from "next/server";
import { flushSupabaseOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.OUTBOX_CRON_SECRET || process.env.CRON_SECRET;
  if (!configured) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) {
    return false;
  }

  const token = bearer.replace("Bearer ", "").trim();
  return token === configured;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

  const result = await flushSupabaseOutbox(
    Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100
  );

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

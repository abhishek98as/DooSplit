import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { requireUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

const TTL_SECONDS = 5 * 60;

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) {
    return auth.response as NextResponse;
  }
  const user = auth.user;

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SUPABASE_JWT_SECRET is not configured" },
      { status: 503 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    exp: now + TTL_SECONDS,
    iat: now,
    sub: user.id,
    user_id: user.id,
    email: user.email || undefined,
    role: "authenticated",
    app_metadata: {
      provider: user.source,
    },
    user_metadata: {
      id: user.id,
      name: user.name || undefined,
    },
  };

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
  });

  return NextResponse.json({
    token,
    expiresAt: new Date((now + TTL_SECONDS) * 1000).toISOString(),
  });
}

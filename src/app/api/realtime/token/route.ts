import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import jwt from "jsonwebtoken";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TTL_SECONDS = 5 * 60;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    sub: session.user.id,
    user_id: session.user.id,
    email: session.user.email || undefined,
    role: "authenticated",
    app_metadata: {
      provider: "nextauth",
    },
    user_metadata: {
      id: session.user.id,
      name: session.user.name || undefined,
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

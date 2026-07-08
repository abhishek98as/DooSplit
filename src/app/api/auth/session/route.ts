import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import {
  FIREBASE_SESSION_COOKIE_NAME,
  FIREBASE_SESSION_MAX_AGE_SECONDS,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { getServerAppUser, verifyFirebaseIdTokenClaims } from "@/lib/auth/server-session";
import { getAdminAuth } from "@/lib/firestore/admin";
import { normalizeEmail, normalizeName } from "@/lib/social/keys";
import { User } from "@/lib/mongodb/models";
import { getMongoDb } from "@/lib/mongodb/client";
import { getDataBackendMode } from "@/lib/data/config";

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export const dynamic = "force-dynamic";

async function ensureUserDoc(decoded: { uid: string; email?: string; name?: string | null }) {
  const backend = getDataBackendMode();
  if (backend === "dynamodb") {
    const { getUserById, putUser } = await import("@/lib/dynamodb/entities/users");
    const existing = await getUserById(decoded.uid);
    if (!existing) {
      const now = new Date().toISOString();
      await putUser({
        id: decoded.uid,
        email: decoded.email || "",
        email_normalized: normalizeEmail(decoded.email || ""),
        name: decoded.name || "User",
        name_normalized: normalizeName(decoded.name || "User"),
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    }
  } else {
    await getMongoDb();
    await User.findOneAndUpdate(
      { _id: decoded.uid },
      {
        $setOnInsert: {
          _id: decoded.uid,
          email: decoded.email || "",
          email_normalized: normalizeEmail(decoded.email || ""),
          name: decoded.name || "User",
          name_normalized: normalizeName(decoded.name || "User"),
          phone: null,
          profile_picture: null,
          default_currency: "INR",
          timezone: "Asia/Kolkata",
          language: "en",
          is_active: true,
          is_dummy: false,
          created_by: null,
          role: "user",
          email_verified: true,
          auth_provider: "firebase",
          push_notifications_enabled: false,
          email_notifications_enabled: true,
          fcm_tokens: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      },
      { upsert: true, new: false }
    );
  }
}

export async function POST(request: NextRequest) {
  // --- Step 1: validate input ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const idToken = String((body as any)?.idToken || "");
  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  // --- Step 2: verify the Firebase ID token ---
  // Try Admin SDK first (authoritative, handles token revocation).
  // Fall back to Firebase public JWKs if Admin is not configured.
  let claims: { uid: string; email?: string | null; name?: string | null } | null = null;

  try {
    const adminAuthInstance = getAdminAuth();
    const decoded = await adminAuthInstance.verifyIdToken(idToken);
    claims = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: (decoded as any).name as string | undefined || null,
    };
  } catch (adminErr: any) {
    const isNotInit = adminErr?.message?.includes("not initialized");
    if (!isNotInit) {
      console.error("[session] Admin verifyIdToken failed:", adminErr?.code, adminErr?.message);
    }
    // Admin SDK unavailable or failed — fall back to JWK verification
    claims = await verifyFirebaseIdTokenClaims(idToken);
  }

  if (!claims) {
    return NextResponse.json(
      { error: "Invalid or expired Firebase ID token" },
      { status: 401 }
    );
  }

  // --- Step 3: ensure user doc (non-fatal) ---
  try {
    await ensureUserDoc({
      uid: claims.uid,
      email: claims.email || undefined,
      name: claims.name,
    });
  } catch (docErr: any) {
    console.error("[session] ensureUserDoc failed (non-fatal):", docErr?.message || docErr);
  }

  // --- Step 4: mint the session JWT (server config error if secret is bad) ---
  try {
    const expiresInMs = FIREBASE_SESSION_MAX_AGE_SECONDS * 1000;
    const expiresAt = new Date(Date.now() + expiresInMs);

    const sessionToken = await new SignJWT({
      uid: claims.uid,
      email: claims.email || null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(getSessionSecret());

    const response = NextResponse.json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
    });

    response.cookies.set(
      FIREBASE_SESSION_COOKIE_NAME,
      sessionToken,
      getSessionCookieOptions()
    );

    return response;
  } catch (err: any) {
    console.error("[session] JWT signing failed:", err?.message);
    return NextResponse.json(
      { error: "Server configuration error: failed to sign session token" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await getServerAppUser(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FIREBASE_SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

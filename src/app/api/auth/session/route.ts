import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, FieldValue } from "@/lib/firestore/admin";
import {
  FIREBASE_SESSION_COOKIE_NAME,
  FIREBASE_SESSION_MAX_AGE_SECONDS,
  getSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { getServerAppUser } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

async function ensureUserDoc(decoded: { uid: string; email?: string; name?: string | null }) {
  const db = getAdminDb();
  const userRef = db.collection("users").doc(decoded.uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    await userRef.set({
      id: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "User",
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
      push_subscription: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _created_at: FieldValue.serverTimestamp(),
      _updated_at: FieldValue.serverTimestamp(),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idToken = String(body?.idToken || "");

    if (!idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken, true);
    await ensureUserDoc({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: (decodedToken.name as string | undefined) || null,
    });

    const expiresIn = FIREBASE_SESSION_MAX_AGE_SECONDS * 1000;
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({
      ok: true,
      expiresAt: new Date(Date.now() + expiresIn).toISOString(),
    });

    response.cookies.set(
      FIREBASE_SESSION_COOKIE_NAME,
      sessionCookie,
      getSessionCookieOptions()
    );

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create session" },
      { status: 401 }
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

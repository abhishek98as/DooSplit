import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb } from "@/lib/firestore/admin";
import { FIREBASE_SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

export type SessionSource = "firebase";

export interface ServerAppUser {
  id: string;
  authUid?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  source: SessionSource;
}

interface DecodedIdentity {
  uid: string;
  email?: string | null;
  name?: string | null;
}

function parseBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();
  return token || null;
}

function getCookieTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(FIREBASE_SESSION_COOKIE_NAME)?.value || null;
}

async function getCookieTokenFromServerContext(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(FIREBASE_SESSION_COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}

async function resolveUserFromUid(identity: DecodedIdentity): Promise<ServerAppUser> {
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(identity.uid).get();
  const user = userDoc.exists ? userDoc.data() || {} : {};

  return {
    id: identity.uid,
    authUid: identity.uid,
    email: (user.email as string | undefined) || identity.email || null,
    name: (user.name as string | undefined) || identity.name || null,
    role: (user.role as string | undefined) || "user",
    source: "firebase",
  };
}

async function verifyIdToken(idToken: string): Promise<ServerAppUser | null> {
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);

    return resolveUserFromUid({
      uid: decoded.uid,
      email: decoded.email || null,
      name: (decoded.name as string | undefined) || null,
    });
  } catch {
    return null;
  }
}

async function verifySessionCookie(sessionCookie: string): Promise<ServerAppUser | null> {
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);

    return resolveUserFromUid({
      uid: decoded.uid,
      email: decoded.email || null,
      name: (decoded.name as string | undefined) || null,
    });
  } catch {
    return null;
  }
}

export async function getServerAppUser(request?: NextRequest): Promise<ServerAppUser | null> {
  if (request) {
    const cookieToken = getCookieTokenFromRequest(request);
    if (cookieToken) {
      const cookieUser = await verifySessionCookie(cookieToken);
      if (cookieUser) {
        return cookieUser;
      }
    }

    const bearerToken = parseBearerToken(request);
    if (bearerToken) {
      const bearerUser = await verifyIdToken(bearerToken);
      if (bearerUser) {
        return bearerUser;
      }
    }

    return null;
  }

  const cookieToken = await getCookieTokenFromServerContext();
  if (!cookieToken) {
    return null;
  }

  return verifySessionCookie(cookieToken);
}

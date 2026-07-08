import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { getAdminAuth } from "@/lib/firestore/admin";
import { User } from "@/lib/mongodb/models";
import { FIREBASE_SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

// Firebase publishes RSA public keys — verify ID tokens without Admin SDK credentials
const firebaseJWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function getFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    ""
  );
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "";
  return new TextEncoder().encode(secret || "no-secret-configured-please-set-SESSION_SECRET");
}

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
  try {
    const user = await User.findById(identity.uid).lean();
    return {
      id: identity.uid,
      authUid: identity.uid,
      email: user?.email || identity.email || null,
      name: user?.name || identity.name || null,
      role: user?.role || "user",
      source: "firebase",
    };
  } catch {
    // MongoDB unavailable — fallback to JWT identity
    return {
      id: identity.uid,
      authUid: identity.uid,
      email: identity.email || null,
      name: identity.name || null,
      role: "user",
      source: "firebase",
    };
  }
}

/**
 * Verifies a Firebase ID token using Firebase's public JWKs.
 * Does NOT require Firebase Admin credentials — only NEXT_PUBLIC_FIREBASE_PROJECT_ID.
 * Exported so the session route can reuse this without importing Admin SDK.
 */
export async function verifyFirebaseIdTokenClaims(
  idToken: string
): Promise<{ uid: string; email?: string | null; name?: string | null } | null> {
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    console.error("[server-session] FIREBASE_PROJECT_ID is not set — cannot verify Firebase token");
    return null;
  }

  try {
    const { payload } = await jwtVerify(idToken, firebaseJWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });

    const uid = (payload.sub || (payload as any).user_id) as string | undefined;
    if (!uid) {
      return null;
    }

    return {
      uid,
      email: ((payload as any).email as string | undefined) || null,
      name: ((payload as any).name as string | undefined) || null,
    };
  } catch (err: any) {
    if (err?.code !== "ERR_JWT_EXPIRED") {
      console.warn("[server-session] Firebase JWK verification failed:", err?.code || err?.message);
    }
    return null;
  }
}

async function verifyIdToken(idToken: string): Promise<ServerAppUser | null> {
  // Step 1: Try Firebase Admin SDK (authoritative — can detect revoked tokens)
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    return resolveUserFromUid({
      uid: decoded.uid,
      email: decoded.email || null,
      name: (decoded.name as string | undefined) || null,
    });
  } catch (err: any) {
    const isNotInitialized = err?.message?.includes("not initialized");
    if (!isNotInitialized) {
      // Genuine auth error (expired, revoked, malformed) — do not fall through
      console.warn("[server-session] Admin verifyIdToken failed:", err?.code || err?.message);
      return null;
    }
    // Admin SDK not configured — fall through to JWK verification
  }

  // Step 2: Verify using Firebase public JWKs — no server credentials needed
  const claims = await verifyFirebaseIdTokenClaims(idToken);
  if (!claims) {
    return null;
  }
  return resolveUserFromUid(claims);
}

async function verifySessionCookie(sessionCookie: string): Promise<ServerAppUser | null> {
  try {
    const { payload } = await jwtVerify(sessionCookie, getSessionSecret());
    const uid = payload.uid as string | undefined;
    if (!uid) {
      return null;
    }

    return resolveUserFromUid({
      uid,
      email: (payload.email as string | null | undefined) || null,
      name: null,
    });
  } catch (err: any) {
    if (err?.code !== "ERR_JWT_EXPIRED") {
      console.error("[server-session] verifySessionCookie failed:", err?.code || err?.message);
    }
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

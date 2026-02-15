import { NextRequest, NextResponse } from "next/server";
import { getServerFirebaseUser } from "./firebase-session";
import { validateAppCheckRequest } from "./app-check";

export interface RequireUserResult {
  user: { id: string; email?: string; name?: string } | null;
  response?: NextResponse;
}

export async function requireUser(request: NextRequest): Promise<RequireUserResult> {
  const appCheck = await validateAppCheckRequest(request);
  if (!appCheck.ok) {
    return {
      user: null,
      response: NextResponse.json(
        { error: appCheck.error || "App Check validation failed" },
        { status: 403 }
      ),
    };
  }

  // Try Firebase auth first
  const firebaseUser = await getServerFirebaseUser(request);
  if (firebaseUser?.id) {
    return { user: firebaseUser };
  }

  // Fallback to legacy session (for backward compatibility during migration)
  try {
    const { getServerAppUser } = await import("./server-session");
    const legacyUser = await getServerAppUser(request);
    if (legacyUser?.id) {
      return {
        user: {
          id: legacyUser.id,
          email: legacyUser.email || undefined,
          name: legacyUser.name || undefined,
        }
      };
    }
  } catch (error) {
    console.warn("Legacy auth fallback failed:", error);
  }

  return {
    user: null,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

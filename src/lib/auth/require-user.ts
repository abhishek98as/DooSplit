import { NextRequest, NextResponse } from "next/server";
import { getServerFirebaseUser } from "./firebase-session";
import { validateAppCheckRequest } from "./app-check";

export interface RequireUserResult {
  user: { id: string; email?: string; name?: string; profilePicture?: string } | null;
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

  const firebaseUser = await getServerFirebaseUser(request);
  if (firebaseUser?.id) {
    return { user: firebaseUser };
  }

  // Legacy session only when explicitly enabled (migration escape hatch)
  const allowLegacy =
    process.env.ALLOW_LEGACY_SESSION === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_LEGACY_SESSION !== "false");

  if (allowLegacy) {
    try {
      const { getServerAppUser } = await import("./server-session");
      const legacyUser = await getServerAppUser(request);
      if (legacyUser?.id) {
        return {
          user: {
            id: legacyUser.id,
            email: legacyUser.email || undefined,
            name: legacyUser.name || undefined,
            profilePicture: legacyUser.profilePicture || undefined,
          },
        };
      }
    } catch (error) {
      console.warn("Legacy auth fallback failed:", error);
    }
  }

  return {
    user: null,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

import type { NextRequest } from "next/server";
import { getServerAppUser } from "@/lib/auth/server-session";
import { validateAppCheckRequest } from "@/lib/auth/app-check";

export async function getServerFirebaseUser(request: NextRequest) {
  try {
    const appCheck = await validateAppCheckRequest(request);
    if (!appCheck.ok) {
      return null;
    }

    const user = await getServerAppUser(request);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email || undefined,
      name: user.name || undefined,
    };
  } catch (error) {
    console.error("Firebase auth error:", error);
    return null;
  }
}

import type { NextRequest } from "next/server";
import { getAppCheck } from "firebase-admin/app-check";
import { adminApp } from "@/lib/firebase-admin";

const APP_CHECK_HEADER = "x-firebase-appcheck";

export interface AppCheckValidationResult {
  ok: boolean;
  required: boolean;
  tokenPresent: boolean;
  appId?: string;
  error?: string;
}

function isAppCheckEnforced(): boolean {
  return process.env.FIREBASE_APP_CHECK_ENFORCE === "true";
}

function getAppCheckTokenFromRequest(request: NextRequest): string {
  return (
    request.headers.get(APP_CHECK_HEADER) ||
    request.headers.get("X-Firebase-AppCheck") ||
    ""
  ).trim();
}

export async function validateAppCheckRequest(
  request: NextRequest
): Promise<AppCheckValidationResult> {
  const required = isAppCheckEnforced();
  const token = getAppCheckTokenFromRequest(request);

  if (!token) {
    if (required) {
      return {
        ok: false,
        required,
        tokenPresent: false,
        error: "App Check token is required",
      };
    }
    return { ok: true, required, tokenPresent: false };
  }

  if (!adminApp) {
    return {
      ok: !required,
      required,
      tokenPresent: true,
      error: "Firebase Admin is not initialized for App Check verification",
    };
  }

  try {
    const appCheck = getAppCheck(adminApp);
    const decoded = await appCheck.verifyToken(token);

    return {
      ok: true,
      required,
      tokenPresent: true,
      appId: decoded.appId,
    };
  } catch (error: any) {
    return {
      ok: false,
      required,
      tokenPresent: true,
      error: error?.message || "Invalid App Check token",
    };
  }
}

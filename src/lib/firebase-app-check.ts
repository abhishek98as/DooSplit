"use client";

import { app } from "@/lib/firebase";

let initialized = false;
let appCheckInstance: any = null;

function getSiteKey(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY?.trim() ||
    ""
  );
}

export async function initializeFirebaseAppCheck(): Promise<any> {
  if (initialized || typeof window === "undefined") {
    return appCheckInstance;
  }
  initialized = true;

  const siteKey = getSiteKey();
  if (!siteKey) {
    console.warn(
      "Firebase App Check site key is not configured (NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY)"
    );
    return null;
  }

  try {
    const debugToken =
      process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim() || "";
    if (debugToken) {
      (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }

    const { initializeAppCheck, ReCaptchaV3Provider } = await import(
      "firebase/app-check"
    );

    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    return appCheckInstance;
  } catch (error) {
    console.error("Failed to initialize Firebase App Check:", error);
    return null;
  }
}

export async function getFirebaseAppCheckToken(
  forceRefresh = false
): Promise<string | null> {
  try {
    const instance = await initializeFirebaseAppCheck();
    if (!instance) {
      return null;
    }

    const { getToken } = await import("firebase/app-check");
    const result = await getToken(instance, forceRefresh);
    return result?.token || null;
  } catch {
    return null;
  }
}

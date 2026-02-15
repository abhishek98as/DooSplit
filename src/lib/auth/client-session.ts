"use client";

import { auth } from "@/lib/firebase";
import { getFirebaseAppCheckToken } from "@/lib/firebase-app-check";

export interface ClientSessionInfo {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }

  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function getClientSessionInfo(): Promise<ClientSessionInfo> {
  const user = auth.currentUser;
  const accessToken = user ? await getFirebaseIdToken() : null;

  return {
    accessToken,
    refreshToken: user?.refreshToken || null,
    userId: user?.uid || null,
    email: user?.email || null,
  };
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const [idToken, appCheckToken] = await Promise.all([
    getFirebaseIdToken(),
    getFirebaseAppCheckToken(),
  ]);
  const headers = new Headers(init.headers || {});

  if (idToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }

  if (appCheckToken && !headers.has("X-Firebase-AppCheck")) {
    headers.set("X-Firebase-AppCheck", appCheckToken);
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

export const firebaseAuthFetch = authFetch;

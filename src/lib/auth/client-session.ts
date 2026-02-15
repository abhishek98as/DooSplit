"use client";

import { auth } from "@/lib/firebase";

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
  const token = await getFirebaseIdToken();
  const headers = new Headers(init.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

export const firebaseAuthFetch = authFetch;

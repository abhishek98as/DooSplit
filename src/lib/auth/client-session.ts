"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface ClientSessionInfo {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
}

export async function getClientSessionInfo(): Promise<ClientSessionInfo> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      accessToken: null,
      refreshToken: null,
      userId: null,
      email: null,
    };
  }

  const { data } = await supabase.auth.getSession();
  const session = data?.session || null;

  return {
    accessToken: session?.access_token || null,
    refreshToken: session?.refresh_token || null,
    userId: session?.user?.id || null,
    email: session?.user?.email || null,
  };
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const session = await getClientSessionInfo();
  const headers = new Headers(init.headers || {});
  if (session.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

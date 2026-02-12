import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type SessionSource = "supabase" | "nextauth";

export interface ServerAppUser {
  id: string;
  authUid?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  source: SessionSource;
}

function parseBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function parseSupabaseTokenFromCookies(request: NextRequest): string | null {
  const directCandidates = [
    "sb-access-token",
    "supabase-access-token",
    "access-token",
  ];

  for (const key of directCandidates) {
    const value = request.cookies.get(key)?.value;
    if (value) {
      return value;
    }
  }

  // Supabase often stores a JSON payload cookie like:
  // sb-<project-ref>-auth-token = ["access_token","refresh_token",...]
  const cookieEntries = request.cookies.getAll();
  for (const entry of cookieEntries) {
    if (!entry.name.endsWith("-auth-token")) {
      continue;
    }
    const raw = entry.value?.trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return parsed[0];
      }
      if (typeof parsed?.access_token === "string" && parsed.access_token) {
        return parsed.access_token;
      }
    } catch {
      // Ignore malformed cookie and continue.
    }
  }

  return null;
}

function extractAccessToken(request?: NextRequest): string | null {
  if (!request) {
    return null;
  }
  return parseBearerToken(request) || parseSupabaseTokenFromCookies(request);
}

async function resolveAppUserByAuthUid(authUid: string): Promise<{
  userId: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
} | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data: identity, error: identityError } = await supabase
    .from("user_identities")
    .select("user_id")
    .eq("auth_uid", authUid)
    .maybeSingle();

  if (identityError) {
    console.warn("Failed to read user_identities:", identityError.message);
    return null;
  }

  if (!identity?.user_id) {
    return null;
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id,email,name,role")
    .eq("id", identity.user_id)
    .maybeSingle();

  if (userError) {
    console.warn("Failed to read users row for auth identity:", userError.message);
    return null;
  }

  if (!userRow?.id) {
    return null;
  }

  return {
    userId: String(userRow.id),
    email: userRow.email || null,
    name: userRow.name || null,
    role: userRow.role || null,
  };
}

async function resolveAppUserByEmail(email: string): Promise<{
  userId: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
} | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const normalized = email.toLowerCase().trim();
  const { data: userRow, error } = await supabase
    .from("users")
    .select("id,email,name,role")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    console.warn("Failed to resolve app user by email:", error.message);
    return null;
  }

  if (!userRow?.id) {
    return null;
  }

  return {
    userId: String(userRow.id),
    email: userRow.email || null,
    name: userRow.name || null,
    role: userRow.role || null,
  };
}

async function ensureIdentityLink(authUid: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("user_identities").upsert(
    {
      auth_uid: authUid,
      user_id: userId,
      provider: "supabase",
    },
    { onConflict: "auth_uid" }
  );

  if (error) {
    console.warn("Failed to upsert user identity link:", error.message);
  }
}

async function trySupabaseSession(request?: NextRequest): Promise<ServerAppUser | null> {
  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return null;
  }

  const client = createSupabaseServerClient(accessToken);
  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    return null;
  }

  const authUser = data.user;
  const authUid = authUser.id;

  let appUser = await resolveAppUserByAuthUid(authUid);

  if (!appUser && authUser.email) {
    appUser = await resolveAppUserByEmail(authUser.email);
    if (appUser) {
      await ensureIdentityLink(authUid, appUser.userId);
    }
  }

  if (!appUser) {
    return null;
  }

  return {
    id: appUser.userId,
    authUid,
    email: appUser.email ?? authUser.email ?? null,
    name: appUser.name ?? null,
    role: appUser.role ?? null,
    source: "supabase",
  };
}

async function tryNextAuthSession(): Promise<ServerAppUser | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return null;
    }
    return {
      id: session.user.id,
      email: session.user.email || null,
      name: session.user.name || null,
      role: session.user.role || null,
      source: "nextauth",
    };
  } catch {
    return null;
  }
}

export async function getServerAppUser(
  request?: NextRequest
): Promise<ServerAppUser | null> {
  const supabaseUser = await trySupabaseSession(request);
  if (supabaseUser) {
    return supabaseUser;
  }

  return tryNextAuthSession();
}

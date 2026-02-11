import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabasePublicConfigured,
} from "./shared";

export function createSupabaseServerClient(
  accessToken?: string
): SupabaseClient | null {
  if (!isSupabasePublicConfigured()) {
    return null;
  }

  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

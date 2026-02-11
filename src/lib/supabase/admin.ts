import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseServiceConfigured,
} from "./shared";

declare global {
  // eslint-disable-next-line no-var
  var __supabaseAdminClient: SupabaseClient | undefined;
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) {
    return null;
  }

  if (!global.__supabaseAdminClient) {
    global.__supabaseAdminClient = createClient(
      getSupabaseUrl(),
      getSupabaseServiceRoleKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return global.__supabaseAdminClient;
}

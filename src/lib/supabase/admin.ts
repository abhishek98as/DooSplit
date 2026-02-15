import "server-only";
import { getFirestoreCompatClient, type FirestoreCompat } from "@/lib/firestore/supabase-compat";

declare global {
  // eslint-disable-next-line no-var
  var __supabaseAdminClient: FirestoreCompat | undefined;
}

export function getSupabaseAdminClient(): FirestoreCompat {
  if (!global.__supabaseAdminClient) {
    global.__supabaseAdminClient = getFirestoreCompatClient();
  }

  return global.__supabaseAdminClient;
}

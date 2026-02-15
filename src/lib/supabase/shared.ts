export function assertSupabasePublicEnv(): void {
  // Deprecated in Firebase cutover.
}

export function isSupabasePublicConfigured(): boolean {
  return false;
}

export function isSupabaseServiceConfigured(): boolean {
  return true;
}

export function getSupabaseUrl(): string {
  return "";
}

export function getSupabaseAnonKey(): string {
  return "";
}

export function getSupabaseServiceRoleKey(): string {
  return "";
}

export function getSupabaseStorageBucket(): string {
  return process.env.FIREBASE_STORAGE_BUCKET || "doosplit";
}

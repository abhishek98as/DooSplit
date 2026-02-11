const REQUIRED_PUBLIC_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function isConfigured(name: string): boolean {
  return typeof process.env[name] === "string" && process.env[name]!.length > 0;
}

export function assertSupabasePublicEnv(): void {
  for (const key of REQUIRED_PUBLIC_VARS) {
    if (!isConfigured(key)) {
      throw new Error(`${key} is not configured`);
    }
  }
}

export function isSupabasePublicConfigured(): boolean {
  return REQUIRED_PUBLIC_VARS.every((key) => isConfigured(key));
}

export function isSupabaseServiceConfigured(): boolean {
  return (
    isSupabasePublicConfigured() &&
    isConfigured("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export function getSupabaseUrl(): string {
  assertSupabasePublicEnv();
  return process.env.NEXT_PUBLIC_SUPABASE_URL as string;
}

export function getSupabaseAnonKey(): string {
  assertSupabasePublicEnv();
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
}

export function getSupabaseServiceRoleKey(): string {
  if (!isConfigured("SUPABASE_SERVICE_ROLE_KEY")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY as string;
}

export function getSupabaseStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "doosplit";
}

export type DataBackendMode = "supabase";
export type DataWriteMode = "single";

export function getDataBackendMode(): DataBackendMode {
  return "supabase";
}

export function getDataWriteMode(): DataWriteMode {
  return "single";
}

export function isSupabaseReadMode(): boolean {
  return true;
}

export function isShadowReadMode(): boolean {
  return false;
}

export function isDualWriteMode(): boolean {
  return false;
}

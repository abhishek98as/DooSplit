export type DataBackendMode = "mongo" | "shadow" | "supabase";
export type DataWriteMode = "single" | "dual";

function normalizeBackendMode(value: string | undefined): DataBackendMode {
  if (value === "shadow" || value === "supabase") {
    return value;
  }
  return "mongo";
}

function normalizeWriteMode(value: string | undefined): DataWriteMode {
  if (value === "dual") {
    return "dual";
  }
  return "single";
}

export function getDataBackendMode(): DataBackendMode {
  return normalizeBackendMode(process.env.DATA_BACKEND_MODE);
}

export function getDataWriteMode(): DataWriteMode {
  return normalizeWriteMode(process.env.DATA_WRITE_MODE);
}

export function isSupabaseReadMode(): boolean {
  return getDataBackendMode() === "supabase";
}

export function isShadowReadMode(): boolean {
  return getDataBackendMode() === "shadow";
}

export function isDualWriteMode(): boolean {
  return getDataWriteMode() === "dual";
}

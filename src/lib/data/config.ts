export type DataBackendMode = "firestore";
export type DataWriteMode = "single";

export function getDataBackendMode(): DataBackendMode {
  return "firestore";
}

export function getDataWriteMode(): DataWriteMode {
  return "single";
}

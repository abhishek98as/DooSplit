export type DataBackendMode = "firestore" | "mongodb" | "dynamodb";
export type DataWriteMode = "single";

/**
 * Feature flag: switch between data backends.
 * Set DATA_BACKEND env var to "dynamodb", "mongodb" (default), or "firestore" (rollback).
 */
export function getDataBackendMode(): DataBackendMode {
  const mode = process.env.DATA_BACKEND;
  if (!mode) return "mongodb";
  const cleaned = mode.replace(/['"\r\n]/g, "").trim().toLowerCase();
  if (cleaned === "firestore") return "firestore";
  if (cleaned === "dynamodb") return "dynamodb";
  return "mongodb";
}

export function getDataWriteMode(): DataWriteMode {
  return "single";
}

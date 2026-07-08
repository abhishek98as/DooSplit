import "server-only";
import { getMongoDb } from "./client";

// ── Utility helpers (identical signatures to firestore/route-helpers) ──

export function toIso(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return "";
}

export function toNum(value: any): number {
  return Number(value || 0);
}

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || "")).filter(Boolean))];
}

export function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

// ── MongoDB-specific fetch helpers ──

/**
 * Batch-fetch documents by _id from a Mongoose model.
 * Replaces `db.collection(x).doc(id).get()` / `db.getAll(...refs)`.
 */
export async function fetchDocsByIds<T>(
  model: any,
  ids: string[]
): Promise<Map<string, T>> {
  await getMongoDb(); // ensure connection
  const rows = new Map<string, T>();
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) return rows;

  const docs = await model.find({ _id: { $in: uniqueIds } }).lean();
  for (const doc of docs) {
    rows.set(doc._id as string, doc as T);
  }
  return rows;
}

/**
 * Fetch rows by a field equality with chunked `$in`.
 * Replaces Firestore `where(field, "in", values)`.
 */
export async function fetchRowsByIn<T>(
  model: any,
  field: string,
  values: string[]
): Promise<T[]> {
  await getMongoDb();
  const unique = uniqueStrings(values);
  if (unique.length === 0) return [];

  return model.find({ [field]: { $in: unique } }).lean() as Promise<T[]>;
}

/**
 * Fetch rows by a single field equality.
 */
export async function fetchRowsByFieldEq<T>(
  model: any,
  field: string,
  value: unknown
): Promise<T[]> {
  await getMongoDb();
  return model.find({ [field]: value }).lean() as Promise<T[]>;
}

/**
 * Fetch the first row matching a single field equality.
 */
export async function fetchFirstRowByFieldEq<T>(
  model: any,
  field: string,
  value: unknown
): Promise<T | null> {
  await getMongoDb();
  return model.findOne({ [field]: value }).lean() as Promise<T | null>;
}

/**
 * Map a MongoDB user doc to the API response shape (same shape as Firestore version).
 */
export function mapUser(row: any) {
  if (!row) return null;
  return {
    _id: row._id,
    name: row.name,
    email: row.email,
    profilePicture: row.profile_picture || null,
    isDummy: row.is_dummy || false,
  };
}

/**
 * Map a MongoDB group doc to the API response shape.
 */
export function mapGroup(row: any) {
  if (!row) return null;
  return {
    _id: row._id,
    name: row.name,
    image: row.image || null,
  };
}

import "server-only";
import { getAdminDb } from "@/lib/firestore/admin";

export function toIso(value: any): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return "";
}

export function toNum(value: any): number {
  return Number(value || 0);
}

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

export function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export async function fetchDocsByIds(
  collection: string,
  ids: string[]
): Promise<Map<string, any>> {
  const db = getAdminDb();
  const rows = new Map<string, any>();
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) {
    return rows;
  }

  for (const idChunk of chunk(uniqueIds, 200)) {
    const refs = idChunk.map((id) => db.collection(collection).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) {
        continue;
      }
      rows.set(doc.id, {
        id: doc.id,
        ...(doc.data() || {}),
      });
    }
  }

  return rows;
}

export async function fetchRowsByIn(
  collection: string,
  field: string,
  values: string[],
  inLimit = 10
): Promise<any[]> {
  const db = getAdminDb();
  const rows: any[] = [];
  const uniqueValues = uniqueStrings(values);
  if (uniqueValues.length === 0) {
    return rows;
  }

  for (const valueChunk of chunk(uniqueValues, inLimit)) {
    const snap = await db
      .collection(collection)
      .where(field, "in", valueChunk)
      .get();
    for (const doc of snap.docs) {
      rows.push({
        id: doc.id,
        ...(doc.data() || {}),
      });
    }
  }

  return rows;
}

export async function fetchRowsByFieldEq(
  collection: string,
  field: string,
  value: string,
  limit?: number
): Promise<any[]> {
  const db = getAdminDb();
  let query = db.collection(collection).where(field, "==", value) as any;
  if (typeof limit === "number") {
    query = query.limit(limit);
  }
  const snap = await query.get();
  return snap.docs.map((doc: any) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));
}

export async function fetchFirstRowByFieldEq(
  collection: string,
  field: string,
  value: string
): Promise<any | null> {
  const rows = await fetchRowsByFieldEq(collection, field, value, 1);
  return rows.length > 0 ? rows[0] : null;
}

export function mapUser(row: any) {
  if (!row) {
    return null;
  }
  return {
    _id: String(row.id || ""),
    id: String(row.id || ""),
    name: String(row.name || "Unknown"),
    email: String(row.email || ""),
    profilePicture: row.profile_picture || row.profilePicture || null,
    isDummy: Boolean(row.is_dummy || row.isDummy),
  };
}

export function mapGroup(row: any) {
  if (!row) {
    return null;
  }
  return {
    _id: String(row.id || ""),
    name: String(row.name || "Untitled Group"),
    image: row.image || null,
  };
}

export function mapNotification(row: any) {
  return {
    _id: String(row.id || ""),
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    type: String(row.type || ""),
    message: String(row.message || ""),
    data: row.data || {},
    isRead: Boolean(row.is_read),
    createdAt: toIso(row.created_at || row._created_at),
    updatedAt: toIso(row.updated_at || row._updated_at),
  };
}

export function logSlowRoute(
  routeKey: string,
  routeStartMs: number,
  thresholdMs = 1200
): number {
  const routeMs = Date.now() - routeStartMs;
  if (routeMs >= thresholdMs) {
    console.warn(`[doosplit][slow-route] ${routeKey} took ${routeMs}ms`);
  }
  return routeMs;
}

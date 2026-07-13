import { getAdminDb } from "./admin";

// DynamoDB-only — mapping helpers for API route compatibility
export function logSlowRoute(_name: string, _ms: number) {}
export function round2(n: number): number { return Math.round(n * 100) / 100; }
export function toIso(d: any): string { return d ? new Date(d).toISOString() : ""; }
export function toNum(v: any, fallback = 0): number { const n = Number(v); return isNaN(n) ? fallback : n; }
export function uniqueStrings(arr: string[]): string[] { return [...new Set(arr.filter(Boolean))]; }

export async function fetchDocsByIds(dbOrColl: any, collOrIds: any, idsOrUndefined?: string[]): Promise<Map<string, any>> {
  let collName: string;
  let ids: string[];

  // Support both (collectionName, ids) and (db, collectionName, ids) signatures
  if (Array.isArray(collOrIds)) {
    collName = String(dbOrColl);
    ids = collOrIds;
  } else {
    collName = String(collOrIds);
    ids = idsOrUndefined || [];
  }

  const uniqueIds = uniqueStrings(ids);
  const map = new Map<string, any>();
  if (uniqueIds.length === 0) {
    return map;
  }

  try {
    const db = getAdminDb();
    const refs = uniqueIds.map((id) => db.collection(collName).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        map.set(doc.id, {
          id: doc.id,
          ...((doc.data() as any) || {}),
        });
      }
    }
  } catch (error) {
    console.error("fetchDocsByIds error:", error);
    // fallback to returning dummy objects so it doesn't crash completely
    for (const id of uniqueIds) {
      map.set(id, { id });
    }
  }

  return map;
}

export function mapUser(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapExpense(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapGroup(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapSettlement(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapNotification(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapInvitation(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }

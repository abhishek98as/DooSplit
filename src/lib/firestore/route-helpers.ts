// DynamoDB-only — mapping helpers for API route compatibility
export function logSlowRoute(_name: string, _ms: number) {}
export function round2(n: number): number { return Math.round(n * 100) / 100; }
export function toIso(d: any): string { return d ? new Date(d).toISOString() : ""; }
export function toNum(v: any, fallback = 0): number { const n = Number(v); return isNaN(n) ? fallback : n; }
export function uniqueStrings(arr: string[]): string[] { return [...new Set(arr)]; }
export function fetchDocsByIds(_db: any, _coll: string, ids: string[]): Promise<any[]> { return Promise.resolve(ids.map(id => ({ id }))); }

export function mapUser(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapExpense(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapGroup(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapSettlement(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapNotification(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }
export function mapInvitation(doc: any) { return { id: doc.id || doc._id, ...doc, _id: undefined }; }

import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

const FIRESTORE_IN_LIMIT = 10;

export function chunkArray<T>(items: T[], size = FIRESTORE_IN_LIMIT): T[][] {
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function chunkedInQuery<T>(
  values: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 0) {
    return [];
  }

  const chunks = chunkArray(unique, FIRESTORE_IN_LIMIT);
  const results = await Promise.all(chunks.map((chunk) => fetchChunk(chunk)));
  return results.flat();
}

export function snapshotToRow<T>(doc: QueryDocumentSnapshot): T {
  const data = doc.data() as Record<string, unknown>;
  if (!data.id) {
    data.id = doc.id;
  }
  return data as T;
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * safeLimit;
  const paged = items.slice(offset, offset + safeLimit);

  return {
    items: paged,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / safeLimit)),
    },
  };
}

export function toIsoDate(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null && "toDate" in (value as Record<string, unknown>)) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }

  return new Date(String(value)).toISOString();
}

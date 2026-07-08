import "server-only";

/**
 * Split an array into chunks of the given size.
 * MongoDB `$in` supports up to ~65,535 values in practice, so chunking
 * is only needed for extremely large ID lists. Default chunk = 500.
 */
export function chunkArray<T>(items: T[], size = 500): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Execute a fetch function across chunks of values.
 * Replaces Firestore chunkedInQuery which split at 10 items per `in()` call.
 */
export async function chunkedInQuery<T>(
  values: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return [];

  const chunks = chunkArray(unique);
  const results = await Promise.all(chunks.map((chunk) => fetchChunk(chunk)));
  return results.flat();
}

/**
 * Generic pagination helper — identical to Firestore version.
 */
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

/**
 * Convert various date representations to ISO string.
 */
export function toIsoDate(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in (value as Record<string, unknown>)
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(String(value)).toISOString();
}

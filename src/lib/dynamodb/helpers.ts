/**
 * Low-level DynamoDB helpers — batch operations, pagination, retries.
 */
import {
  BatchGetCommand,
  BatchWriteCommand,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "./client";
import { TABLE } from "./tables";

// ── Chunking ──────────────────────────────────────────────────────────────────

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Batch Get ─────────────────────────────────────────────────────────────────

/**
 * Fetch up to N items by {PK, SK} pairs in batches of 100.
 * Automatically handles unprocessed keys with exponential back-off.
 */
export async function batchGetItems(
  keys: Array<{ PK: string; SK: string }>,
  tableName = TABLE
): Promise<Record<string, unknown>[]> {
  if (keys.length === 0) return [];
  const client = getDynamoDB();
  const results: Record<string, unknown>[] = [];

  for (const batch of chunk(keys, 100)) {
    let remaining = batch;
    let delay = 50;

    while (remaining.length > 0) {
      const cmd = new BatchGetCommand({
        RequestItems: { [tableName]: { Keys: remaining } },
      });
      const res = await client.send(cmd);
      const items = (res.Responses?.[tableName] ?? []) as Record<string, unknown>[];
      results.push(...items);

      const unprocessed = res.UnprocessedKeys?.[tableName]?.Keys as
        | Array<{ PK: string; SK: string }>
        | undefined;
      if (!unprocessed || unprocessed.length === 0) break;
      remaining = unprocessed;
      await sleep(delay);
      delay = Math.min(delay * 2, 2000);
    }
  }

  return results;
}

// ── Batch Write ───────────────────────────────────────────────────────────────

/**
 * Write up to N put/delete requests in batches of 25.
 * Retries unprocessed items with exponential back-off.
 */
export async function batchWriteItems(
  requests: Array<
    | { PutRequest: { Item: Record<string, unknown> } }
    | { DeleteRequest: { Key: { PK: string; SK: string } } }
  >,
  tableName = TABLE
): Promise<void> {
  if (requests.length === 0) return;
  const client = getDynamoDB();

  for (const batch of chunk(requests, 25)) {
    let remaining = batch;
    let delay = 50;

    while (remaining.length > 0) {
      const cmd = new BatchWriteCommand({
        RequestItems: { [tableName]: remaining },
      });
      const res = await client.send(cmd);
      const unprocessed = res.UnprocessedItems?.[tableName] as typeof remaining | undefined;
      if (!unprocessed || unprocessed.length === 0) break;
      remaining = unprocessed;
      await sleep(delay);
      delay = Math.min(delay * 2, 2000);
    }
  }
}

// ── Full Query (all pages) ────────────────────────────────────────────────────

/** Run a Query and auto-paginate until all results are collected. */
export async function queryAll<T = Record<string, unknown>>(
  input: QueryCommandInput
): Promise<T[]> {
  const client = getDynamoDB();
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const cmd = new QueryCommand({ ...input, ExclusiveStartKey: lastKey });
    const res = await client.send(cmd);
    if (res.Items) items.push(...(res.Items as T[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

// ── Paged Query ───────────────────────────────────────────────────────────────

export interface PagedResult<T> {
  items: T[];
  nextToken?: string;
}

/** Run a Query with a limit and return a cursor for the next page. */
export async function queryPaged<T = Record<string, unknown>>(
  input: QueryCommandInput,
  limit: number,
  nextToken?: string
): Promise<PagedResult<T>> {
  const client = getDynamoDB();
  const cmd = new QueryCommand({
    ...input,
    Limit: limit,
    ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, "base64url").toString()) : undefined,
  });
  const res = await client.send(cmd);
  return {
    items: (res.Items ?? []) as T[],
    nextToken: res.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString("base64url")
      : undefined,
  };
}

// ── TTL helpers ───────────────────────────────────────────────────────────────

/** Convert a future date to Unix epoch seconds for DynamoDB TTL */
export function ttlFromDate(d: Date | string): number {
  return Math.floor(new Date(d).getTime() / 1000);
}

/** TTL N days from now */
export function ttlDaysFromNow(days: number): number {
  return Math.floor((Date.now() + days * 86_400_000) / 1000);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

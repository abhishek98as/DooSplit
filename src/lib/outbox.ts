import crypto from "crypto";
import dbConnect from "@/lib/db";
import SupabaseOutbox from "@/models/SupabaseOutbox";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface OutboxEntryInput {
  operation: "upsert" | "delete";
  table: string;
  recordId: string;
  payload?: Record<string, any>;
  idempotencyKey?: string;
}

function computeIdempotencyKey(entry: OutboxEntryInput): string {
  if (entry.idempotencyKey) {
    return entry.idempotencyKey;
  }
  const seed = JSON.stringify({
    operation: entry.operation,
    table: entry.table,
    recordId: entry.recordId,
    payload: entry.payload || null,
  });
  return crypto.createHash("sha1").update(seed).digest("hex");
}

export async function enqueueSupabaseOutbox(entry: OutboxEntryInput): Promise<void> {
  await dbConnect();
  const idempotencyKey = computeIdempotencyKey(entry);

  await SupabaseOutbox.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        idempotencyKey,
        operation: entry.operation,
        table: entry.table,
        recordId: entry.recordId,
        payload: entry.payload || null,
        status: "pending",
        retries: 0,
        maxRetries: 10,
        nextRetryAt: new Date(),
      },
    },
    { upsert: true }
  );
}

function backoffMs(retries: number): number {
  const clamped = Math.min(10, Math.max(1, retries));
  return Math.min(5 * 60 * 1000, 5000 * 2 ** (clamped - 1));
}

export async function flushSupabaseOutbox(limit = 100): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  await dbConnect();
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 1 };
  }

  const now = new Date();
  const items = await SupabaseOutbox.find({
    status: { $in: ["pending", "failed"] },
    nextRetryAt: { $lte: now },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    processed += 1;
    await SupabaseOutbox.updateOne(
      { _id: item._id, status: { $in: ["pending", "failed"] } },
      { $set: { status: "processing" } }
    );

    try {
      if (item.operation === "upsert") {
        const { error } = await supabase
          .from(item.table)
          .upsert(item.payload || {}, { onConflict: "id" });
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from(item.table)
          .delete()
          .eq("id", item.recordId);
        if (error) {
          throw error;
        }
      }

      await SupabaseOutbox.updateOne(
        { _id: item._id },
        {
          $set: {
            status: "done",
            error: null,
          },
        }
      );
      succeeded += 1;
    } catch (error: any) {
      const retries = (item.retries || 0) + 1;
      const maxRetries = item.maxRetries || 10;
      const nextRetryAt = new Date(Date.now() + backoffMs(retries));

      await SupabaseOutbox.updateOne(
        { _id: item._id },
        {
          $set: {
            status: retries >= maxRetries ? "failed" : "pending",
            retries,
            error: error?.message || "Unknown outbox error",
            nextRetryAt,
          },
        }
      );
      failed += 1;
    }
  }

  return {
    processed,
    succeeded,
    failed,
    skipped: 0,
  };
}

import { isDualWriteMode } from "./config";
import { enqueueSupabaseOutbox } from "@/lib/outbox";

export async function mirrorUpsertToSupabase(
  table: string,
  recordId: string,
  payload: Record<string, any>
): Promise<void> {
  if (!isDualWriteMode()) {
    return;
  }

  await enqueueSupabaseOutbox({
    operation: "upsert",
    table,
    recordId,
    payload,
  });
}

export async function mirrorDeleteToSupabase(
  table: string,
  recordId: string
): Promise<void> {
  if (!isDualWriteMode()) {
    return;
  }

  await enqueueSupabaseOutbox({
    operation: "delete",
    table,
    recordId,
  });
}

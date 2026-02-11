import "server-only";
import { getSupabaseAdminClient } from "./admin";

export async function invokeSupabaseEdgeFunction<TInput extends object, TOutput = unknown>(
  functionName: string,
  payload: TInput,
  idempotencyKey?: string
): Promise<TOutput> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase service client is not configured");
  }

  const { data, error } = await client.functions.invoke(functionName, {
    body: payload,
    headers: idempotencyKey
      ? {
          "x-idempotency-key": idempotencyKey,
        }
      : undefined,
  });

  if (error) {
    throw new Error(`Edge function ${functionName} failed: ${error.message}`);
  }

  return data as TOutput;
}

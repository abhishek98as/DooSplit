import {
  getDataBackendMode,
  isShadowReadMode,
  isSupabaseReadMode,
} from "./config";
import { mongoReadRepository } from "./mongo-adapter";
import { supabaseReadRepository } from "./supabase-adapter";

function extractPrimaryCount(payload: any): number | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  for (const key of [
    "friends",
    "groups",
    "expenses",
    "activities",
    "settlements",
  ]) {
    if (Array.isArray(payload[key])) {
      return payload[key].length;
    }
  }
  return undefined;
}

function logShadowDiff(
  routeName: string,
  userId: string,
  requestKey: string,
  mongoPayload: any,
  supabasePayload: any
): void {
  const mongoCount = extractPrimaryCount(mongoPayload);
  const supabaseCount = extractPrimaryCount(supabasePayload);
  if (mongoCount !== supabaseCount) {
    console.warn("Shadow read mismatch", {
      routeName,
      userId,
      requestKey,
      mode: getDataBackendMode(),
      mongoCount,
      supabaseCount,
    });
  }
}

export async function readWithMode<T>({
  routeName,
  userId,
  requestKey,
  mongoRead,
  supabaseRead,
}: {
  routeName: string;
  userId: string;
  requestKey: string;
  mongoRead: () => Promise<T>;
  supabaseRead: () => Promise<T>;
}): Promise<T> {
  if (isSupabaseReadMode()) {
    return supabaseRead();
  }

  if (isShadowReadMode()) {
    const mongoPayload = await mongoRead();
    void supabaseRead()
      .then((supabasePayload) => {
        logShadowDiff(routeName, userId, requestKey, mongoPayload, supabasePayload);
      })
      .catch((error: any) => {
        console.warn("Shadow read error", {
          routeName,
          userId,
          requestKey,
          error: error?.message || "Unknown error",
        });
      });
    return mongoPayload;
  }

  return mongoRead();
}

export { mongoReadRepository, supabaseReadRepository };

import "server-only";

import { getMessaging } from "firebase-admin/messaging";
import { getAdminDb, FieldValue } from "@/lib/firestore/admin";
import { adminApp } from "@/lib/firebase-admin";

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function normalizeData(
  data: PushNotificationPayload["data"] = {}
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    output[key] = String(value);
  }
  return output;
}

async function getTokensByUserId(userIds: string[]): Promise<Map<string, string[]>> {
  const db = getAdminDb();
  const map = new Map<string, string[]>();

  for (const userId of unique(userIds)) {
    map.set(userId, []);
  }

  const refs = unique(userIds).map((userId) => db.collection("users").doc(userId));
  for (const refChunk of chunk(refs, 200)) {
    const docs = await db.getAll(...refChunk);
    for (const doc of docs) {
      if (!doc.exists) {
        continue;
      }

      const user = doc.data() || {};
      if (user.push_notifications_enabled === false) {
        continue;
      }

      const tokensRaw = Array.isArray(user.fcm_tokens) ? user.fcm_tokens : [];
      const tokens = unique(tokensRaw.map((token) => String(token)));
      if (tokens.length > 0) {
        map.set(doc.id, tokens);
      }
    }
  }

  return map;
}

async function cleanupInvalidTokens(invalidEntries: Array<{ userId: string; token: string }>) {
  if (invalidEntries.length === 0) {
    return;
  }

  const db = getAdminDb();
  const grouped = new Map<string, string[]>();
  for (const entry of invalidEntries) {
    const list = grouped.get(entry.userId) || [];
    list.push(entry.token);
    grouped.set(entry.userId, list);
  }

  await Promise.all(
    Array.from(grouped.entries()).map(async ([userId, tokens]) => {
      const uniqueTokens = unique(tokens);
      if (uniqueTokens.length === 0) {
        return;
      }

      await db.collection("users").doc(userId).set(
        {
          fcm_tokens: FieldValue.arrayRemove(...uniqueTokens),
          updated_at: new Date().toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

export async function sendPushNotificationToUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<{ successCount: number; failureCount: number; tokenCount: number }> {
  if (!adminApp) {
    return { successCount: 0, failureCount: 0, tokenCount: 0 };
  }

  const tokensByUser = await getTokensByUserId(userIds);
  const tokenOwners: Array<{ token: string; userId: string }> = [];
  for (const [userId, tokens] of tokensByUser.entries()) {
    for (const token of tokens) {
      tokenOwners.push({ token, userId });
    }
  }

  if (tokenOwners.length === 0) {
    return { successCount: 0, failureCount: 0, tokenCount: 0 };
  }

  const messaging = getMessaging(adminApp);
  const nowIso = new Date().toISOString();
  let successCount = 0;
  let failureCount = 0;
  const invalidEntries: Array<{ userId: string; token: string }> = [];

  for (const ownerChunk of chunk(tokenOwners, 500)) {
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: normalizeData(payload.data),
      tokens: ownerChunk.map((owner) => owner.token),
      webpush: {
        fcmOptions: payload.url ? { link: payload.url } : undefined,
        notification: {
          title: payload.title,
          body: payload.body,
          icon: "/logo.webp",
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((item, index) => {
      if (item.success) {
        return;
      }

      const owner = ownerChunk[index];
      const code = item.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalidEntries.push({ userId: owner.userId, token: owner.token });
      }
    });
  }

  await cleanupInvalidTokens(invalidEntries);

  await Promise.all(
    Array.from(tokensByUser.keys()).map((userId) =>
      getAdminDb()
        .collection("users")
        .doc(userId)
        .set(
          {
            last_push_sent_at: nowIso,
            _updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
    )
  );

  return {
    successCount,
    failureCount,
    tokenCount: tokenOwners.length,
  };
}

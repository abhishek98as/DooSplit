import { PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK, toSortableTs } from "../keys";
import type { DdbNotification } from "../types";
import { ttlDaysFromNow, queryPaged, type PagedResult } from "../helpers";

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putNotification(
  notif: Omit<DdbNotification, "PK" | "SK" | "entityType" | "ttl">
): Promise<void> {
  const ts = toSortableTs(notif.created_at);
  const item: DdbNotification = {
    PK: PK.user(notif.user_id),
    SK: SK.notification(ts, notif.id),
    entityType: "notification",
    ttl: ttlDaysFromNow(30),
    ...notif,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function queryNotificationsForUser(
  userId: string,
  limit: number,
  nextToken?: string,
  unreadOnly = false
): Promise<PagedResult<DdbNotification>> {
  let filterExpr = "entityType = :et";
  const vals: Record<string, unknown> = {
    ":pk": PK.user(userId),
    ":prefix": "NOTIF#",
    ":et": "notification",
  };

  if (unreadOnly) {
    filterExpr += " AND is_read = :unread";
    vals[":unread"] = false;
  }

  return queryPaged<DdbNotification>(
    {
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: filterExpr,
      ExpressionAttributeValues: vals,
      ScanIndexForward: false,
    },
    limit,
    nextToken
  );
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  userId: string,
  createdAt: string,
  notifId: string
): Promise<void> {
  const ts = toSortableTs(createdAt);
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.notification(ts, notifId) },
      UpdateExpression: "SET is_read = :t",
      ExpressionAttributeValues: { ":t": true },
    })
  );
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  // Fetch all unread, then batch-update
  const { items } = await queryNotificationsForUser(userId, 200, undefined, true);
  const client = getDynamoDB();
  await Promise.all(
    items.map((n) =>
      client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: PK.user(userId), SK: n.SK },
          UpdateExpression: "SET is_read = :t",
          ExpressionAttributeValues: { ":t": true },
        })
      )
    )
  );
}

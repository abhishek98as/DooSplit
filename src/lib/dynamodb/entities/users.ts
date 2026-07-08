import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK, GSI1PK, GSI1SK } from "../keys";
import type { DdbUser } from "../types";
import { batchGetItems, queryAll } from "../helpers";

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putUser(user: Omit<DdbUser, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">): Promise<void> {
  const item: DdbUser = {
    PK: PK.user(user.id),
    SK: SK.profile,
    entityType: "user",
    GSI1PK: GSI1PK.email(user.email_normalized),
    GSI1SK: GSI1SK.user(user.id),
    ...user,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export async function getUserById(userId: string): Promise<DdbUser | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.user(userId), SK: SK.profile } })
  );
  return (res.Item as DdbUser) ?? null;
}

// ── Get by email ──────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<DdbUser | null> {
  const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
  const { GSI1 } = await import("../tables");
  const res = await getDynamoDB().send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI1,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": GSI1PK.email(email) },
      Limit: 1,
    })
  );
  return (res.Items?.[0] as DdbUser) ?? null;
}

// ── Batch Get ─────────────────────────────────────────────────────────────────

export async function getUsersByIds(userIds: string[]): Promise<DdbUser[]> {
  if (userIds.length === 0) return [];
  const keys = userIds.map((id) => ({ PK: PK.user(id), SK: SK.profile }));
  return (await batchGetItems(keys)) as unknown as DdbUser[];
}

// ── Search by name (prefix scan — only for small result sets) ─────────────────

export async function searchUsersByName(nameLower: string): Promise<DdbUser[]> {
  return queryAll<DdbUser>({
    TableName: TABLE,
    FilterExpression: "contains(name_normalized, :q) AND entityType = :et",
    ExpressionAttributeValues: {
      ":q": nameLower.toLowerCase(),
      ":et": "user",
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateUser(
  userId: string,
  fields: Partial<Pick<DdbUser, "name" | "name_normalized" | "display_name" | "photo_url" | "phone_number" | "default_currency" | "preferences" | "is_active" | "updated_at">>
): Promise<void> {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    vals[`:${k}`] = v;
  }
  if (sets.length === 0) return;

  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.profile },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: PK.user(userId), SK: SK.profile } })
  );
}

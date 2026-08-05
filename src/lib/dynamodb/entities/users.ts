import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2, GSI3 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK } from "../keys";
import type { DdbUser } from "../types";
import { batchGetItems, queryAll } from "../helpers";

function userGsi3(nameNormalized: string, userId: string) {
  return {
    GSI3PK: GSI3PK.name(),
    GSI3SK: GSI3SK.userName(nameNormalized || "", userId),
  };
}

function userDummyGsi2(user: { is_dummy?: boolean; created_by?: string; name_normalized?: string; id: string }) {
  if (!user.is_dummy || !user.created_by) return {};
  return {
    GSI2PK: GSI2PK.dummyOf(user.created_by),
    GSI2SK: GSI2SK.dummy(user.name_normalized || "", user.id),
  };
}

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putUser(
  user: Omit<DdbUser, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "GSI3PK" | "GSI3SK">
): Promise<void> {
  const item: DdbUser = {
    PK: PK.user(user.id),
    SK: SK.profile,
    entityType: "user",
    GSI1PK: GSI1PK.email(user.email_normalized),
    GSI1SK: GSI1SK.user(user.id),
    ...userGsi3(user.name_normalized, user.id),
    ...userDummyGsi2(user),
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

/**
 * Prefix search on name_normalized via GSI3 (no table Scan).
 */
export async function searchUsersByNamePrefix(
  namePrefix: string,
  limit = 20
): Promise<DdbUser[]> {
  const prefix = namePrefix.toLowerCase().trim();
  if (!prefix) return [];

  const res = await getDynamoDB().send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI3,
      KeyConditionExpression: "GSI3PK = :pk AND begins_with(GSI3SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": GSI3PK.name(),
        ":prefix": prefix,
      },
      Limit: Math.min(Math.max(limit, 1), 50),
    })
  );
  return (res.Items || []) as DdbUser[];
}

/** Dummy friends created by a user — via GSI2 DUMMYOF#{userId} */
export async function listDummiesCreatedByUser(userId: string): Promise<DdbUser[]> {
  return queryAll<DdbUser>({
    TableName: TABLE,
    IndexName: GSI2,
    KeyConditionExpression: "GSI2PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI2PK.dummyOf(userId) },
  });
}

/** @deprecated Use searchUsersByNamePrefix — kept for rare admin tooling */
export async function searchUsersByName(nameLower: string): Promise<DdbUser[]> {
  return searchUsersByNamePrefix(nameLower, 50);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateUser(
  userId: string,
  fields: Partial<
    Pick<
      DdbUser,
      | "name"
      | "name_normalized"
      | "display_name"
      | "photo_url"
      | "phone_number"
      | "default_currency"
      | "preferences"
      | "is_active"
      | "updated_at"
      | "email"
      | "email_normalized"
      | "push_notifications_enabled"
      | "email_notifications_enabled"
    >
  > &
    Record<string, unknown>
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

  if (fields.name_normalized !== undefined) {
    sets.push("GSI3PK = :gsi3pk", "GSI3SK = :gsi3sk");
    vals[":gsi3pk"] = GSI3PK.name();
    vals[":gsi3sk"] = GSI3SK.userName(fields.name_normalized, userId);
  }

  if (fields.email_normalized !== undefined) {
    sets.push("GSI1PK = :gsi1pk");
    vals[":gsi1pk"] = GSI1PK.email(fields.email_normalized);
  }

  if (sets.length === 0) return;

  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.profile },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
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

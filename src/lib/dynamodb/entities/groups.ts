import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK } from "../keys";
import type { DdbGroup, DdbGroupMember } from "../types";
import { batchGetItems, queryAll } from "../helpers";

// ── Group CRUD ────────────────────────────────────────────────────────────────

export async function putGroup(
  group: Omit<DdbGroup, "PK" | "SK" | "entityType">
): Promise<void> {
  const item: DdbGroup = {
    PK: PK.group(group.id),
    SK: SK.meta,
    entityType: "group",
    ...group,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getGroupById(groupId: string): Promise<DdbGroup | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.group(groupId), SK: SK.meta } })
  );
  return (res.Item as DdbGroup) ?? null;
}

export async function getGroupsByIds(groupIds: string[]): Promise<DdbGroup[]> {
  if (groupIds.length === 0) return [];
  const keys = groupIds.map((id) => ({ PK: PK.group(id), SK: SK.meta }));
  return (await batchGetItems(keys)) as unknown as DdbGroup[];
}

export async function updateGroup(
  groupId: string,
  fields: Partial<
    Pick<
      DdbGroup,
      | "name"
      | "description"
      | "image"
      | "type"
      | "notes"
      | "settle_up_date"
      | "simplify_debts"
      | "settle_up_reminders_enabled"
      | "default_split"
      | "currency"
      | "is_active"
      | "member_count"
      | "updated_at"
    >
  >
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
      Key: { PK: PK.group(groupId), SK: SK.meta },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

export async function deleteGroup(groupId: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: PK.group(groupId), SK: SK.meta } })
  );
}

// ── Group Members ─────────────────────────────────────────────────────────────

export async function putGroupMember(
  member: Omit<DdbGroupMember, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const item: DdbGroupMember = {
    PK: PK.group(member.group_id),
    SK: SK.member(member.user_id),
    entityType: "group_member",
    GSI1PK: GSI1PK.member(member.user_id),
    GSI1SK: GSI1SK.group(member.group_id),
    ...member,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getGroupMember(
  groupId: string,
  userId: string
): Promise<DdbGroupMember | null> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.group(groupId), SK: SK.member(userId) },
    })
  );
  return (res.Item as DdbGroupMember) ?? null;
}

export async function listGroupMembers(groupId: string): Promise<DdbGroupMember[]> {
  return queryAll<DdbGroupMember>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": PK.group(groupId), ":prefix": "MEMBER#" },
  });
}

/** Get all groups where userId is a member — via GSI1 */
export async function listGroupsForUser(userId: string): Promise<DdbGroupMember[]> {
  return queryAll<DdbGroupMember>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.member(userId) },
  });
}

export async function updateGroupMember(
  groupId: string,
  userId: string,
  fields: Partial<Pick<DdbGroupMember, "role" | "status" | "updated_at">>
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
      Key: { PK: PK.group(groupId), SK: SK.member(userId) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

export async function deleteGroupMember(groupId: string, userId: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.group(groupId), SK: SK.member(userId) },
    })
  );
}

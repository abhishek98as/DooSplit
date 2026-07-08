import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK } from "../keys";
import type { DdbUserNudgeState } from "../types";
import { queryAll } from "../helpers";

export async function putNudgeState(
  nudge: Omit<DdbUserNudgeState, "PK" | "SK" | "entityType">
): Promise<void> {
  const item: DdbUserNudgeState = {
    PK: PK.user(nudge.user_id),
    SK: SK.nudge(nudge.nudge_id),
    entityType: "user_nudge",
    ...nudge,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getNudgeState(
  userId: string,
  nudgeId: string
): Promise<DdbUserNudgeState | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.user(userId), SK: SK.nudge(nudgeId) } })
  );
  return (res.Item as DdbUserNudgeState) ?? null;
}

export async function listNudgeStatesForUser(userId: string): Promise<DdbUserNudgeState[]> {
  return queryAll<DdbUserNudgeState>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": PK.user(userId), ":prefix": "NUDGE#" },
  });
}

export async function updateNudgeState(
  userId: string,
  nudgeId: string,
  fields: Partial<Pick<DdbUserNudgeState, "state" | "last_nudge_at" | "nudge_count" | "updated_at">>
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
      Key: { PK: PK.user(userId), SK: SK.nudge(nudgeId) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

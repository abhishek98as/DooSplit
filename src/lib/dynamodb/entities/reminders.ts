import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, toSortableTs } from "../keys";
import type { DdbReminder } from "../types";
import { queryAll } from "../helpers";

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putReminder(
  reminder: Omit<DdbReminder, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK">
): Promise<void> {
  const ts = toSortableTs(reminder.created_at);
  const item: DdbReminder = {
    PK: PK.reminder(reminder.id),
    SK: SK.meta,
    entityType: "payment_reminder",
    GSI1PK: GSI1PK.reminderTo(reminder.to_user_id),
    GSI1SK: GSI1SK.reminder(reminder.status, ts, reminder.id),
    GSI2PK: GSI2PK.reminderFrom(reminder.from_user_id),
    GSI2SK: GSI2SK.reminder(reminder.status, ts, reminder.id),
    ...reminder,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

// ── Get ───────────────────────────────────────────────────────────────────────

export async function getReminderById(id: string): Promise<DdbReminder | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.reminder(id), SK: SK.meta } })
  );
  return (res.Item as DdbReminder) ?? null;
}

// ── Query by recipient ────────────────────────────────────────────────────────

export async function listRemindersByRecipient(
  toUserId: string,
  status?: string
): Promise<DdbReminder[]> {
  const vals: Record<string, unknown> = { ":pk": GSI1PK.reminderTo(toUserId) };
  let keyExpr = "GSI1PK = :pk";

  if (status) {
    keyExpr += " AND begins_with(GSI1SK, :statusPrefix)";
    vals[":statusPrefix"] = `${status}#`;
  }

  return queryAll<DdbReminder>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: keyExpr,
    ExpressionAttributeValues: vals,
    ScanIndexForward: false,
  });
}

// ── Query by sender ───────────────────────────────────────────────────────────

export async function listRemindersBySender(
  fromUserId: string,
  status?: string
): Promise<DdbReminder[]> {
  const vals: Record<string, unknown> = { ":pk": GSI2PK.reminderFrom(fromUserId) };
  let keyExpr = "GSI2PK = :pk";

  if (status) {
    keyExpr += " AND begins_with(GSI2SK, :statusPrefix)";
    vals[":statusPrefix"] = `${status}#`;
  }

  return queryAll<DdbReminder>({
    TableName: TABLE,
    IndexName: GSI2,
    KeyConditionExpression: keyExpr,
    ExpressionAttributeValues: vals,
    ScanIndexForward: false,
  });
}

// ── Update status ─────────────────────────────────────────────────────────────

export async function updateReminderStatus(
  id: string,
  status: string,
  updatedAt: string,
  lastPushAt?: string
): Promise<void> {
  let updateExpr = "SET #st = :status, updated_at = :ua";
  const vals: Record<string, unknown> = { ":status": status, ":ua": updatedAt };
  if (lastPushAt) {
    updateExpr += ", last_push_at = :lpa";
    vals[":lpa"] = lastPushAt;
  }
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.reminder(id), SK: SK.meta },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: vals,
    })
  );
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteReminder(id: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: PK.reminder(id), SK: SK.meta } })
  );
}

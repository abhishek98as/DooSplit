import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2, GSI3 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, toSortableTs } from "../keys";
import type { DdbReminder } from "../types";
import { queryAll } from "../helpers";

function reminderGsi3(status: string, createdAt: string, id: string) {
  const ts = toSortableTs(createdAt);
  return {
    GSI3PK: GSI3PK.reminderStatus(status),
    GSI3SK: GSI3SK.reminder(ts, id),
  };
}

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putReminder(
  reminder: Omit<
    DdbReminder,
    "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "GSI3PK" | "GSI3SK"
  >
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
    ...reminderGsi3(reminder.status, reminder.created_at, reminder.id),
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

/**
 * All reminders with a given status via GSI3 (no table Scan).
 */
export async function listRemindersByStatus(status: string): Promise<DdbReminder[]> {
  return queryAll<DdbReminder>({
    TableName: TABLE,
    IndexName: GSI3,
    KeyConditionExpression: "GSI3PK = :pk",
    ExpressionAttributeValues: {
      ":pk": GSI3PK.reminderStatus(status),
    },
    ScanIndexForward: true,
  });
}

// ── Update status ─────────────────────────────────────────────────────────────

export async function updateReminderStatus(
  id: string,
  status: string,
  updatedAt: string,
  lastPushAt?: string,
  extra?: { read_at?: string; paid_at?: string }
): Promise<void> {
  const existing = await getReminderById(id);
  const createdAt = existing?.created_at || updatedAt;
  const gsi3 = reminderGsi3(status, createdAt, id);

  const toUserId = existing?.to_user_id;
  const fromUserId = existing?.from_user_id;
  const ts = toSortableTs(createdAt);

  let updateExpr =
    "SET #st = :status, updated_at = :ua, GSI3PK = :gsi3pk, GSI3SK = :gsi3sk";
  const vals: Record<string, unknown> = {
    ":status": status,
    ":ua": updatedAt,
    ":gsi3pk": gsi3.GSI3PK,
    ":gsi3sk": gsi3.GSI3SK,
  };

  if (toUserId) {
    updateExpr += ", GSI1SK = :gsi1sk";
    vals[":gsi1sk"] = GSI1SK.reminder(status, ts, id);
  }
  if (fromUserId) {
    updateExpr += ", GSI2SK = :gsi2sk";
    vals[":gsi2sk"] = GSI2SK.reminder(status, ts, id);
  }
  if (lastPushAt) {
    updateExpr += ", last_push_at = :lpa";
    vals[":lpa"] = lastPushAt;
  }
  if (extra?.read_at) {
    updateExpr += ", read_at = :readAt";
    vals[":readAt"] = extra.read_at;
  }
  if (extra?.paid_at) {
    updateExpr += ", paid_at = :paidAt";
    vals[":paidAt"] = extra.paid_at;
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

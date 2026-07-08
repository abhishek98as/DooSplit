import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK, GSI1PK, GSI1SK } from "../keys";
import type { DdbFriendship } from "../types";
import { queryAll } from "../helpers";

// ── Upsert (bidirectional) ────────────────────────────────────────────────────

/**
 * Atomically writes BOTH directions of a friendship in one transaction.
 * Use for create and status updates.
 */
export async function putFriendshipBidirectional(
  friendship: Omit<DdbFriendship, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const base = {
    entityType: "friendship" as const,
    id: friendship.id,
    status: friendship.status,
    requested_by: friendship.requested_by,
    created_at: friendship.created_at,
    updated_at: friendship.updated_at,
  };

  const forward: DdbFriendship = {
    PK: PK.user(friendship.user_id),
    SK: SK.friend(friendship.friend_id),
    GSI1PK: GSI1PK.friendOf(friendship.friend_id),
    GSI1SK: GSI1SK.user(friendship.user_id),
    user_id: friendship.user_id,
    friend_id: friendship.friend_id,
    ...base,
  };

  const reverse: DdbFriendship = {
    PK: PK.user(friendship.friend_id),
    SK: SK.friend(friendship.user_id),
    GSI1PK: GSI1PK.friendOf(friendship.user_id),
    GSI1SK: GSI1SK.user(friendship.friend_id),
    user_id: friendship.friend_id,
    friend_id: friendship.user_id,
    ...base,
  };

  await getDynamoDB().send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE, Item: forward } },
        { Put: { TableName: TABLE, Item: reverse } },
      ],
    })
  );
}

// ── Get ───────────────────────────────────────────────────────────────────────

export async function getFriendship(
  userId: string,
  friendId: string
): Promise<DdbFriendship | null> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.friend(friendId) },
    })
  );
  return (res.Item as DdbFriendship) ?? null;
}

// ── List for user ─────────────────────────────────────────────────────────────

export async function listFriendshipsForUser(
  userId: string,
  status?: string
): Promise<DdbFriendship[]> {
  const params: Parameters<typeof queryAll>[0] = {
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": PK.user(userId),
      ":prefix": "FRIEND#",
    },
  };

  if (status) {
    params.FilterExpression = "#st = :status";
    params.ExpressionAttributeNames = { "#st": "status" };
    (params.ExpressionAttributeValues as Record<string, unknown>)[":status"] = status;
  }

  return queryAll<DdbFriendship>(params);
}

// ── Update status (bidirectional) ─────────────────────────────────────────────

export async function updateFriendshipStatus(
  userIdA: string,
  userIdB: string,
  status: DdbFriendship["status"],
  updatedAt: string
): Promise<void> {
  const expr = "SET #st = :status, updated_at = :ua";
  const names = { "#st": "status" };
  const vals = { ":status": status, ":ua": updatedAt };

  await getDynamoDB().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: PK.user(userIdA), SK: SK.friend(userIdB) },
            UpdateExpression: expr,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: vals,
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: PK.user(userIdB), SK: SK.friend(userIdA) },
            UpdateExpression: expr,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: vals,
          },
        },
      ],
    })
  );
}

// ── Delete (bidirectional) ────────────────────────────────────────────────────

export async function deleteFriendshipBidirectional(
  userIdA: string,
  userIdB: string
): Promise<void> {
  await getDynamoDB().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE,
            Key: { PK: PK.user(userIdA), SK: SK.friend(userIdB) },
          },
        },
        {
          Delete: {
            TableName: TABLE,
            Key: { PK: PK.user(userIdB), SK: SK.friend(userIdA) },
          },
        },
      ],
    })
  );
}

// ── Query via GSI: "who has userId as a friend" ───────────────────────────────

export async function listReverseConnections(userId: string): Promise<DdbFriendship[]> {
  const { GSI1 } = await import("../tables");
  return queryAll<DdbFriendship>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.friendOf(userId) },
  });
}

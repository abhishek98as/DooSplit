import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, toSortableTs } from "../keys";
import type { DdbSettlement, DdbSettlementAllocation, DdbSettlementFeed } from "../types";
import { batchGetItems, queryAll, queryPaged, type PagedResult } from "../helpers";

// ── Settlement META ───────────────────────────────────────────────────────────

export async function putSettlementMeta(
  settlement: Omit<DdbSettlement, "PK" | "SK" | "entityType">
): Promise<void> {
  const item: DdbSettlement = {
    PK: PK.settlement(settlement.id),
    SK: SK.meta,
    entityType: "settlement",
    ...settlement,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getSettlementById(id: string): Promise<DdbSettlement | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.settlement(id), SK: SK.meta } })
  );
  return (res.Item as DdbSettlement) ?? null;
}

export async function getSettlementsByIds(ids: string[]): Promise<DdbSettlement[]> {
  if (ids.length === 0) return [];
  const keys = ids.map((id) => ({ PK: PK.settlement(id), SK: SK.meta }));
  return (await batchGetItems(keys)) as unknown as DdbSettlement[];
}

export async function updateSettlement(
  id: string,
  fields: Partial<Pick<DdbSettlement, "notes" | "is_deleted" | "updated_at">>
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
      Key: { PK: PK.settlement(id), SK: SK.meta },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

// ── Settlement Feed (fan-out under USER#{userId}) ─────────────────────────────

export async function putSettlementFeed(
  feed: Omit<DdbSettlementFeed, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const ts = toSortableTs(feed.date);
  const gsi1pk = feed.direction === "sent"
    ? GSI1PK.settlFrom(feed.user_id)
    : GSI1PK.settlTo(feed.user_id);
  const gsi1sk = GSI1SK.settlement(ts, feed.settlement_id);
  const gsi2pk = feed.group_id ? GSI2PK.settlGroup(feed.group_id) : undefined;
  const gsi2sk = feed.group_id ? GSI2SK.settlement(ts, feed.settlement_id) : undefined;

  const item: DdbSettlementFeed = {
    PK: PK.user(feed.user_id),
    SK: SK.settlement(ts, feed.settlement_id),
    entityType: "settlement_feed",
    GSI1PK: gsi1pk,
    GSI1SK: gsi1sk,
    ...(gsi2pk && gsi2sk ? { GSI2PK: gsi2pk, GSI2SK: gsi2sk } : {}),
    ...feed,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function queryUserSettlementFeed(
  userId: string,
  limit: number,
  nextToken?: string,
  filters?: { groupId?: string; friendId?: string }
): Promise<PagedResult<DdbSettlementFeed>> {
  let filterExpr = "entityType = :et AND is_deleted = :del";
  const vals: Record<string, unknown> = {
    ":pk": PK.user(userId),
    ":prefix": "SETTLEMENT#",
    ":et": "settlement_feed",
    ":del": false,
  };
  if (filters?.groupId) {
    filterExpr += " AND group_id = :gid";
    vals[":gid"] = filters.groupId;
  }
  if (filters?.friendId) {
    filterExpr += " AND (from_user_id = :fid OR to_user_id = :fid)";
    vals[":fid"] = filters.friendId;
  }
  return queryPaged<DdbSettlementFeed>(
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

/** Get all settlements between two users (both sent and received) */
export async function querySettlementsBetween(
  userId: string,
  otherId: string
): Promise<DdbSettlementFeed[]> {
  const all = await queryAll<DdbSettlementFeed>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    FilterExpression:
      "entityType = :et AND is_deleted = :del AND (from_user_id = :oid OR to_user_id = :oid)",
    ExpressionAttributeValues: {
      ":pk": PK.user(userId),
      ":prefix": "SETTLEMENT#",
      ":et": "settlement_feed",
      ":del": false,
      ":oid": otherId,
    },
  });
  return all;
}

export async function deleteSettlementFeed(
  userId: string,
  date: string,
  settlementId: string
): Promise<void> {
  const ts = toSortableTs(date);
  await getDynamoDB().send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.settlement(ts, settlementId) },
    })
  );
}

// ── Group Settlement Feed (query by group via GSI2) ───────────────────────────

export async function queryGroupSettlements(
  groupId: string,
  limit: number,
  nextToken?: string
): Promise<PagedResult<DdbSettlementFeed>> {
  return queryPaged<DdbSettlementFeed>(
    {
      TableName: TABLE,
      IndexName: GSI2,
      KeyConditionExpression: "GSI2PK = :pk",
      FilterExpression: "is_deleted = :del",
      ExpressionAttributeValues: {
        ":pk": GSI2PK.settlGroup(groupId),
        ":del": false,
      },
      ScanIndexForward: false,
    },
    limit,
    nextToken
  );
}

// ── Settlement Allocations ────────────────────────────────────────────────────

export async function putSettlementAllocation(
  alloc: Omit<DdbSettlementAllocation, "PK" | "SK" | "entityType">
): Promise<void> {
  const item: DdbSettlementAllocation = {
    PK: PK.settlement(alloc.settlement_id),
    SK: SK.alloc(alloc.expense_id),
    entityType: "settlement_allocation",
    ...alloc,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function listSettlementAllocations(
  settlementId: string
): Promise<DdbSettlementAllocation[]> {
  return queryAll<DdbSettlementAllocation>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": PK.settlement(settlementId),
      ":prefix": "ALLOC#",
    },
  });
}

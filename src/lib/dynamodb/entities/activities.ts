import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK, toSortableTs } from "../keys";
import type { DdbActivityLog } from "../types";
import { ttlDaysFromNow, queryPaged, type PagedResult } from "../helpers";

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putActivityLog(
  activity: Omit<DdbActivityLog, "PK" | "SK" | "entityType" | "ttl">
): Promise<void> {
  const ts = toSortableTs(activity.createdAt);
  const item: DdbActivityLog = {
    PK: PK.user(activity.userId),
    SK: SK.activity(ts, activity.id),
    entityType: "activity_log",
    ttl: ttlDaysFromNow(90),
    ...activity,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function queryActivitiesForUser(
  userId: string,
  limit: number,
  nextToken?: string,
  typeFilter?: string
): Promise<PagedResult<DdbActivityLog>> {
  let filterExpr = "entityType = :et";
  const vals: Record<string, unknown> = {
    ":pk": PK.user(userId),
    ":prefix": "ACTIVITY#",
    ":et": "activity_log",
  };

  if (typeFilter) {
    filterExpr += " AND #type = :type";
    vals[":type"] = typeFilter;
  }

  return queryPaged<DdbActivityLog>(
    {
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: filterExpr,
      ...(typeFilter ? { ExpressionAttributeNames: { "#type": "type" } } : {}),
      ExpressionAttributeValues: vals,
      ScanIndexForward: false,
    },
    limit,
    nextToken
  );
}

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, toSortableTs } from "../keys";
import type {
  DdbExpense,
  DdbExpenseParticipant,
  DdbExpenseComment,
  DdbExpenseFeed,
  DdbGroupExpenseFeed,
} from "../types";
import { batchGetItems, queryAll, queryPaged, type PagedResult } from "../helpers";

// ── Expense META ──────────────────────────────────────────────────────────────

export async function putExpenseMeta(
  expense: Omit<DdbExpense, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const ts = toSortableTs(expense.date);
  const item: DdbExpense = {
    PK: PK.expense(expense.id),
    SK: SK.meta,
    entityType: "expense",
    GSI1PK: GSI1PK.expOwner(expense.created_by),
    GSI1SK: GSI1SK.expense(ts, expense.id),
    ...expense,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getExpenseById(expenseId: string): Promise<DdbExpense | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.expense(expenseId), SK: SK.meta } })
  );
  return (res.Item as DdbExpense) ?? null;
}

export async function getExpensesByIds(ids: string[]): Promise<DdbExpense[]> {
  if (ids.length === 0) return [];
  return (await batchGetItems(ids.map((id) => ({ PK: PK.expense(id), SK: SK.meta })))) as unknown as DdbExpense[];
}

/** Expenses created by a user — via GSI1 (EOWNER#userId) */
export async function listExpensesByCreator(
  userId: string,
  filters?: { category?: string; startDate?: string; endDate?: string }
): Promise<DdbExpense[]> {
  let filterExpr = "entityType = :et AND (attribute_not_exists(is_deleted) OR is_deleted = :del)";
  const vals: Record<string, unknown> = {
    ":pk": GSI1PK.expOwner(userId),
    ":et": "expense",
    ":del": false,
  };

  if (filters?.category) {
    filterExpr += " AND category = :cat";
    vals[":cat"] = filters.category;
  }
  if (filters?.startDate) {
    filterExpr += " AND #date >= :start";
    vals[":start"] = filters.startDate;
  }
  if (filters?.endDate) {
    filterExpr += " AND #date <= :end";
    vals[":end"] = filters.endDate;
  }

  return queryAll<DdbExpense>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    FilterExpression: filterExpr,
    ExpressionAttributeValues: vals,
    ...(filters?.startDate || filters?.endDate
      ? { ExpressionAttributeNames: { "#date": "date" } }
      : {}),
  });
}

export async function updateExpense(
  expenseId: string,
  fields: Partial<
    Pick<
      DdbExpense,
      | "description"
      | "amount"
      | "currency"
      | "category"
      | "date"
      | "notes"
      | "is_deleted"
      | "is_settled"
      | "receipt_images"
      | "payment_status"
      | "payment_status_updated_at"
      | "payment_status_updated_by"
      | "edit_history"
      | "group_id"
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
      Key: { PK: PK.expense(expenseId), SK: SK.meta },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

export async function deleteExpenseMeta(expenseId: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: PK.expense(expenseId), SK: SK.meta } })
  );
}

// ── Expense Participants ──────────────────────────────────────────────────────

export async function putExpenseParticipant(
  participant: Omit<DdbExpenseParticipant, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const ts = toSortableTs(participant.expense_date);
  const item: DdbExpenseParticipant = {
    PK: PK.expense(participant.expense_id),
    SK: SK.part(participant.user_id),
    entityType: "expense_participant",
    GSI1PK: GSI1PK.expPart(participant.user_id),
    GSI1SK: GSI1SK.expense(ts, participant.expense_id),
    ...participant,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getExpenseParticipant(
  expenseId: string,
  userId: string
): Promise<DdbExpenseParticipant | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.expense(expenseId), SK: SK.part(userId) } })
  );
  return (res.Item as DdbExpenseParticipant) ?? null;
}

export async function listExpenseParticipants(
  expenseId: string
): Promise<DdbExpenseParticipant[]> {
  return queryAll<DdbExpenseParticipant>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": PK.expense(expenseId), ":prefix": "PART#" },
  });
}

/** Get all expense IDs where userId is a participant — via GSI1 */
export async function listExpenseIdsByParticipant(
  userId: string
): Promise<Array<{ expense_id: string; expense_date: string }>> {
  const items = await queryAll<DdbExpenseParticipant>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.expPart(userId) },
    ProjectionExpression: "expense_id, expense_date",
  });
  return items.map((i) => ({ expense_id: i.expense_id, expense_date: i.expense_date }));
}

export async function batchGetExpenseParticipants(
  expenseIds: string[],
  userId: string
): Promise<DdbExpenseParticipant[]> {
  if (expenseIds.length === 0) return [];
  const keys = expenseIds.map((eid) => ({ PK: PK.expense(eid), SK: SK.part(userId) }));
  return (await batchGetItems(keys)) as unknown as DdbExpenseParticipant[];
}

export async function updateExpenseParticipant(
  expenseId: string,
  userId: string,
  fields: Partial<Pick<DdbExpenseParticipant, "amount_owed" | "amount_paid" | "is_settled" | "is_excluded" | "updated_at">>
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
      Key: { PK: PK.expense(expenseId), SK: SK.part(userId) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

// ── Expense Feed (fan-out under USER#{userId}) ────────────────────────────────

export async function putExpenseFeed(
  feed: Omit<DdbExpenseFeed, "PK" | "SK" | "entityType">
): Promise<void> {
  const ts = toSortableTs(feed.date);
  const item: DdbExpenseFeed = {
    PK: PK.user(feed.user_id),
    SK: SK.expense(ts, feed.expense_id),
    entityType: "expense_feed",
    ...feed,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function queryUserExpenseFeed(
  userId: string,
  limit: number,
  nextToken?: string,
  filters?: {
    groupId?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    isSettled?: boolean;
    search?: string;
  }
): Promise<PagedResult<DdbExpenseFeed>> {
  let filterExpr = "entityType = :et AND (attribute_not_exists(is_deleted) OR is_deleted = :del)";
  const vals: Record<string, unknown> = {
    ":pk": PK.user(userId),
    ":prefix": "EXPENSE#",
    ":et": "expense_feed",
    ":del": false,
  };

  if (filters?.groupId) {
    filterExpr += " AND group_id = :gid";
    vals[":gid"] = filters.groupId;
  }
  if (filters?.category) {
    filterExpr += " AND category = :cat";
    vals[":cat"] = filters.category;
  }
  if (filters?.isSettled !== undefined) {
    filterExpr += " AND is_settled = :settled";
    vals[":settled"] = filters.isSettled;
  }
  if (filters?.startDate) {
    const ts = toSortableTs(filters.startDate);
    filterExpr += " AND #date >= :start";
    vals[":start"] = ts;
  }
  if (filters?.endDate) {
    const ts = toSortableTs(filters.endDate);
    filterExpr += " AND #date <= :end";
    vals[":end"] = ts;
  }

  const baseInput = {
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    FilterExpression: filterExpr,
    ExpressionAttributeValues: vals,
    ScanIndexForward: false,
    ...(filters?.startDate || filters?.endDate
      ? { ExpressionAttributeNames: { "#date": "date" } }
      : {}),
  };

  return queryPaged<DdbExpenseFeed>(baseInput, limit, nextToken);
}

export async function deleteExpenseFeed(
  userId: string,
  date: string,
  expenseId: string
): Promise<void> {
  const ts = toSortableTs(date);
  await getDynamoDB().send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.expense(ts, expenseId) },
    })
  );
}

// ── Group Expense Feed (fan-out under GROUP#{groupId}) ────────────────────────

export async function putGroupExpenseFeed(
  feed: Omit<DdbGroupExpenseFeed, "PK" | "SK" | "entityType">
): Promise<void> {
  const ts = toSortableTs(feed.date);
  const item: DdbGroupExpenseFeed = {
    PK: PK.group(feed.group_id),
    SK: SK.expense(ts, feed.expense_id),
    entityType: "group_expense_feed",
    ...feed,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function queryGroupExpenseFeed(
  groupId: string,
  limit: number,
  nextToken?: string
): Promise<PagedResult<DdbGroupExpenseFeed>> {
  return queryPaged<DdbGroupExpenseFeed>(
    {
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: "entityType = :et AND (attribute_not_exists(is_deleted) OR is_deleted = :del)",
      ExpressionAttributeValues: {
        ":pk": PK.group(groupId),
        ":prefix": "EXPENSE#",
        ":et": "group_expense_feed",
        ":del": false,
      },
      ScanIndexForward: false,
    },
    limit,
    nextToken
  );
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function putExpenseComment(
  comment: Omit<DdbExpenseComment, "PK" | "SK" | "entityType">
): Promise<void> {
  const ts = toSortableTs(comment.created_at);
  const item: DdbExpenseComment = {
    PK: PK.expense(comment.expense_id),
    SK: SK.comment(ts, comment.id),
    entityType: "expense_comment",
    ...comment,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function listExpenseComments(expenseId: string): Promise<DdbExpenseComment[]> {
  return queryAll<DdbExpenseComment>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": PK.expense(expenseId), ":prefix": "COMMENT#" },
    ScanIndexForward: true,
  });
}

export async function deleteExpenseComment(
  expenseId: string,
  ts: string,
  commentId: string
): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.expense(expenseId), SK: SK.comment(ts, commentId) },
    })
  );
}

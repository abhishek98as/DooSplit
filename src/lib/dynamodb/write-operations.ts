/**
 * Transactional write operations for DooSplit.
 * Each function atomically creates or updates a logically-grouped set of items.
 */
import { TransactWriteCommand, type TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "./client";
import { TABLE } from "./tables";
import { PK, SK, GSI1PK, GSI1SK, toSortableTs } from "./keys";
import type {
  DdbExpense,
  DdbExpenseParticipant,
  DdbExpenseFeed,
  DdbGroupExpenseFeed,
  DdbGroup,
  DdbGroupMember,
  DdbSettlement,
  DdbSettlementFeed,
  DdbSettlementAllocation,
  DdbFriendship,
} from "./types";
import { batchWriteItems } from "./helpers";

// ── Expense ───────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  expense: Omit<DdbExpense, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">;
  participants: Array<
    Omit<DdbExpenseParticipant, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
  >;
}

export async function createExpenseInDynamo(input: CreateExpenseInput): Promise<void> {
  const { expense, participants } = input;
  const ts = toSortableTs(expense.date);

  // Build the core transact items (expense META + participants)
  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.expense(expense.id),
          SK: SK.meta,
          entityType: "expense",
          GSI1PK: GSI1PK.expOwner(expense.created_by),
          GSI1SK: GSI1SK.expense(ts, expense.id),
          ...expense,
        } satisfies DdbExpense,
      },
    },
    ...participants.map((p) => ({
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.expense(expense.id),
          SK: SK.part(p.user_id),
          entityType: "expense_participant",
          GSI1PK: GSI1PK.expPart(p.user_id),
          GSI1SK: GSI1SK.expense(ts, expense.id),
          ...p,
        } satisfies DdbExpenseParticipant,
      },
    })),
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));

  // Fan-out feed records (non-transactional BatchWrite — idempotent on retry)
  const fanOutRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [
    // User expense feed for each participant
    ...participants.map((p) => ({
      PutRequest: {
        Item: {
          PK: PK.user(p.user_id),
          SK: SK.expense(ts, expense.id),
          entityType: "expense_feed",
          expense_id: expense.id,
          user_id: p.user_id,
          amount_owed: p.amount_owed,
          amount_paid: p.amount_paid,
          is_settled: p.is_settled,
          is_excluded: p.is_excluded,
          group_id: expense.group_id,
          created_by: expense.created_by,
          description: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          date: expense.date,
          split_type: expense.split_type,
          is_deleted: expense.is_deleted,
          created_at: expense.created_at,
          updated_at: expense.updated_at,
        } satisfies DdbExpenseFeed,
      },
    })),
    // Group expense feed (if group expense)
    ...(expense.group_id
      ? [
          {
            PutRequest: {
              Item: {
                PK: PK.group(expense.group_id),
                SK: SK.expense(ts, expense.id),
                entityType: "group_expense_feed",
                expense_id: expense.id,
                group_id: expense.group_id,
                created_by: expense.created_by,
                description: expense.description,
                amount: expense.amount,
                currency: expense.currency,
                category: expense.category,
                date: expense.date,
                split_type: expense.split_type,
                is_deleted: expense.is_deleted,
                is_settled: expense.is_settled,
                created_at: expense.created_at,
                updated_at: expense.updated_at,
              } satisfies DdbGroupExpenseFeed,
            },
          },
        ]
      : []),
  ];

  await batchWriteItems(fanOutRequests);
}

// ── Group ─────────────────────────────────────────────────────────────────────

export interface CreateGroupInput {
  group: Omit<DdbGroup, "PK" | "SK" | "entityType">;
  members: Array<Omit<DdbGroupMember, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">>;
}

export async function createGroupInDynamo(input: CreateGroupInput): Promise<void> {
  const { group, members } = input;

  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.group(group.id),
          SK: SK.meta,
          entityType: "group",
          ...group,
        } satisfies DdbGroup,
      },
    },
    ...members.map((m) => ({
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.group(group.id),
          SK: SK.member(m.user_id),
          entityType: "group_member",
          GSI1PK: GSI1PK.member(m.user_id),
          GSI1SK: GSI1SK.group(group.id),
          ...m,
        } satisfies DdbGroupMember,
      },
    })),
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));
}

// ── Settlement ────────────────────────────────────────────────────────────────

export interface CreateSettlementInput {
  settlement: Omit<DdbSettlement, "PK" | "SK" | "entityType">;
  allocations?: Array<{ expense_id: string; amount: number; created_at: string; updated_at: string }>;
}

export async function createSettlementInDynamo(input: CreateSettlementInput): Promise<void> {
  const { settlement, allocations = [] } = input;
  const ts = toSortableTs(settlement.date);

  const sentFeed: DdbSettlementFeed = {
    PK: PK.user(settlement.from_user_id),
    SK: SK.settlement(ts, settlement.id),
    entityType: "settlement_feed",
    GSI1PK: GSI1PK.settlFrom(settlement.from_user_id),
    GSI1SK: GSI1SK.settlement(ts, settlement.id),
    settlement_id: settlement.id,
    user_id: settlement.from_user_id,
    direction: "sent",
    ...settlement,
  };

  const receivedFeed: DdbSettlementFeed = {
    PK: PK.user(settlement.to_user_id),
    SK: SK.settlement(ts, settlement.id),
    entityType: "settlement_feed",
    GSI1PK: GSI1PK.settlTo(settlement.to_user_id),
    GSI1SK: GSI1SK.settlement(ts, settlement.id),
    settlement_id: settlement.id,
    user_id: settlement.to_user_id,
    direction: "received",
    ...settlement,
  };

  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.settlement(settlement.id),
          SK: SK.meta,
          entityType: "settlement",
          ...settlement,
        } satisfies DdbSettlement,
      },
    },
    { Put: { TableName: TABLE, Item: sentFeed } },
    { Put: { TableName: TABLE, Item: receivedFeed } },
    ...allocations.map((a) => ({
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.settlement(settlement.id),
          SK: SK.alloc(a.expense_id),
          entityType: "settlement_allocation",
          settlement_id: settlement.id,
          expense_id: a.expense_id,
          amount: a.amount,
          created_at: a.created_at,
          updated_at: a.updated_at,
        },
      },
    })),
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));
}

// ── Friendship ────────────────────────────────────────────────────────────────

export interface CreateFriendshipInput {
  friendship: Omit<DdbFriendship, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">;
}

export async function createFriendshipInDynamo(input: CreateFriendshipInput): Promise<void> {
  const { friendship } = input;

  const forward: DdbFriendship = {
    PK: PK.user(friendship.user_id),
    SK: SK.friend(friendship.friend_id),
    entityType: "friendship",
    GSI1PK: GSI1PK.friendOf(friendship.friend_id),
    GSI1SK: GSI1SK.user(friendship.user_id),
    ...friendship,
  };

  const reverse: DdbFriendship = {
    PK: PK.user(friendship.friend_id),
    SK: SK.friend(friendship.user_id),
    entityType: "friendship",
    GSI1PK: GSI1PK.friendOf(friendship.user_id),
    GSI1SK: GSI1SK.user(friendship.friend_id),
    user_id: friendship.friend_id,
    friend_id: friendship.user_id,
    id: friendship.id,
    status: friendship.status,
    requested_by: friendship.requested_by,
    created_at: friendship.created_at,
    updated_at: friendship.updated_at,
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

export interface UpdateExpenseInput {
  expenseId: string;
  expense: Omit<DdbExpense, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">;
  participants: Array<
    Omit<DdbExpenseParticipant, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
  >;
  oldParticipantUserIds: string[];
  oldDate: string;
  oldGroupId?: string | null;
}

export async function updateExpenseInDynamo(input: UpdateExpenseInput): Promise<void> {
  const { expenseId, expense, participants, oldParticipantUserIds, oldDate, oldGroupId } = input;
  const oldTs = toSortableTs(oldDate);
  const newTs = toSortableTs(expense.date);

  // 1. Delete all old feed items and participant rows
  const deleteRequests: Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }> = [];
  
  // Delete old user feeds and old participant metadata rows
  for (const userId of oldParticipantUserIds) {
    deleteRequests.push({
      DeleteRequest: {
        Key: { PK: PK.user(userId), SK: SK.expense(oldTs, expenseId) },
      },
    });
    deleteRequests.push({
      DeleteRequest: {
        Key: { PK: PK.expense(expenseId), SK: SK.part(userId) },
      },
    });
  }

  // Delete old group feed (if any)
  if (oldGroupId) {
    deleteRequests.push({
      DeleteRequest: {
        Key: { PK: PK.group(oldGroupId), SK: SK.expense(oldTs, expenseId) },
      },
    });
  }

  if (deleteRequests.length > 0) {
    await batchWriteItems(deleteRequests);
  }

  // 2. Put new core records (main expense meta + participants) transactionally
  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.expense(expenseId),
          SK: SK.meta,
          entityType: "expense",
          GSI1PK: GSI1PK.expOwner(expense.created_by),
          GSI1SK: GSI1SK.expense(newTs, expenseId),
          ...expense,
        } satisfies DdbExpense,
      },
    },
    ...participants.map((p) => ({
      Put: {
        TableName: TABLE,
        Item: {
          PK: PK.expense(expenseId),
          SK: SK.part(p.user_id),
          entityType: "expense_participant",
          GSI1PK: GSI1PK.expPart(p.user_id),
          GSI1SK: GSI1SK.expense(newTs, expenseId),
          ...p,
        } satisfies DdbExpenseParticipant,
      },
    })),
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));

  // 3. Put new fan-out feed records
  const fanOutRequests: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [
    // User expense feed for each participant
    ...participants.map((p) => ({
      PutRequest: {
        Item: {
          PK: PK.user(p.user_id),
          SK: SK.expense(newTs, expenseId),
          entityType: "expense_feed",
          expense_id: expenseId,
          user_id: p.user_id,
          amount_owed: p.amount_owed,
          amount_paid: p.amount_paid,
          is_settled: p.is_settled,
          is_excluded: p.is_excluded,
          group_id: expense.group_id,
          created_by: expense.created_by,
          description: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          date: expense.date,
          split_type: expense.split_type,
          is_deleted: expense.is_deleted,
          created_at: expense.created_at,
          updated_at: expense.updated_at,
        } satisfies DdbExpenseFeed,
      },
    })),
    // Group expense feed (if group expense)
    ...(expense.group_id
      ? [
          {
            PutRequest: {
              Item: {
                PK: PK.group(expense.group_id),
                SK: SK.expense(newTs, expenseId),
                entityType: "group_expense_feed",
                expense_id: expenseId,
                group_id: expense.group_id,
                created_by: expense.created_by,
                description: expense.description,
                amount: expense.amount,
                currency: expense.currency,
                category: expense.category,
                date: expense.date,
                split_type: expense.split_type,
                is_deleted: expense.is_deleted,
                is_settled: expense.is_settled,
                created_at: expense.created_at,
                updated_at: expense.updated_at,
              } satisfies DdbGroupExpenseFeed,
            },
          },
        ]
      : []),
  ];

  await batchWriteItems(fanOutRequests);
}

export async function updateExpensePaymentStatusInDynamo(
  expenseId: string,
  paymentStatus: string,
  updatedBy: string,
  updatedAt: string
): Promise<void> {
  const { getExpenseById, listExpenseParticipants } = await import("./entities/expenses");
  const expense = await getExpenseById(expenseId);
  if (!expense) return;

  const participants = await listExpenseParticipants(expenseId);
  const ts = toSortableTs(expense.date);
  const isSettled = paymentStatus === "settled";

  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Update: {
        TableName: TABLE,
        Key: { PK: PK.expense(expenseId), SK: SK.meta },
        UpdateExpression: "SET payment_status = :status, is_settled = :settled, payment_status_updated_at = :ts, payment_status_updated_by = :by, updated_at = :ts",
        ExpressionAttributeValues: {
          ":status": paymentStatus,
          ":settled": isSettled,
          ":ts": updatedAt,
          ":by": updatedBy,
        },
      },
    },
    ...participants.map((p) => ({
      Update: {
        TableName: TABLE,
        Key: { PK: PK.expense(expenseId), SK: SK.part(p.user_id) },
        UpdateExpression: "SET is_settled = :settled, updated_at = :ts",
        ExpressionAttributeValues: {
          ":settled": isSettled,
          ":ts": updatedAt,
        },
      },
    })),
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));

  // Update feed items
  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  const client = getDynamoDB();
  const feedUpdates = participants.map((p) =>
    client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: PK.user(p.user_id), SK: SK.expense(ts, expenseId) },
        UpdateExpression: "SET is_settled = :settled, updated_at = :ts",
        ExpressionAttributeValues: {
          ":settled": isSettled,
          ":ts": updatedAt,
        },
      })
    )
  );

  if (expense.group_id) {
    feedUpdates.push(
      client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: PK.group(expense.group_id), SK: SK.expense(ts, expenseId) },
          UpdateExpression: "SET is_settled = :settled, updated_at = :ts",
          ExpressionAttributeValues: {
            ":settled": isSettled,
            ":ts": updatedAt,
          },
        })
      )
    );
  }

  await Promise.all(feedUpdates);
}

export async function deleteExpenseInDynamo(expenseId: string, deletedAt: string): Promise<void> {
  const { getExpenseById, listExpenseParticipants } = await import("./entities/expenses");
  const expense = await getExpenseById(expenseId);
  if (!expense) return;

  const participants = await listExpenseParticipants(expenseId);
  const ts = toSortableTs(expense.date);

  const transactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = [
    {
      Update: {
        TableName: TABLE,
        Key: { PK: PK.expense(expenseId), SK: SK.meta },
        UpdateExpression: "SET is_deleted = :deleted, updated_at = :ts",
        ExpressionAttributeValues: {
          ":deleted": true,
          ":ts": deletedAt,
        },
      },
    },
  ];

  await getDynamoDB().send(new TransactWriteCommand({ TransactItems: transactItems }));

  // Update feed items to mark as deleted
  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  const client = getDynamoDB();
  const feedUpdates = participants.map((p) =>
    client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: PK.user(p.user_id), SK: SK.expense(ts, expenseId) },
        UpdateExpression: "SET is_deleted = :deleted, updated_at = :ts",
        ExpressionAttributeValues: {
          ":deleted": true,
          ":ts": deletedAt,
        },
      })
    )
  );

  if (expense.group_id) {
    feedUpdates.push(
      client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: PK.group(expense.group_id), SK: SK.expense(ts, expenseId) },
          UpdateExpression: "SET is_deleted = :deleted, updated_at = :ts",
          ExpressionAttributeValues: {
            ":deleted": true,
            ":ts": deletedAt,
          },
        })
      )
    );
  }

  await Promise.all(feedUpdates);
}




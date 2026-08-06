import crypto from "crypto";
import { BatchWriteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "@/lib/dynamodb/client";
import { TABLE } from "@/lib/dynamodb/tables";
import { PK, SK, toSortableTs } from "@/lib/dynamodb/keys";
import { ttlDaysFromNow } from "@/lib/dynamodb/helpers";
import type { DdbNotification } from "@/lib/dynamodb/types";

type IdLike = string | { toString(): string };

export interface CreateNotificationParams {
  userId: IdLike;
  type: string;
  message: string;
  data?: Record<string, any>;
  /** Skip FCM push (e.g. when caller already sent one). */
  skipPush?: boolean;
}

function newId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function toId(value: IdLike): string {
  return typeof value === "string" ? value : value.toString();
}

function pushTitleForType(type: string): string {
  switch (type) {
    case "expense_added":
    case "group_expense":
      return "New expense";
    case "expense_updated":
      return "Expense updated";
    case "expense_deleted":
      return "Expense deleted";
    case "settlement_recorded":
    case "settlement_added":
    case "payment_received":
      return "Settlement";
    case "friend_request":
      return "Friend request";
    case "friend_accepted":
      return "Friend added";
    case "friend_removed":
      return "Friend removed";
    case "group_invitation":
      return "Group invitation";
    case "note_share_invite":
      return "Note invitation";
    case "note_share_accepted":
      return "Note share accepted";
    default:
      return "DooSplit";
  }
}

function pushUrlForType(type: string, data: Record<string, any> = {}): string {
  switch (type) {
    case "expense_added":
    case "expense_updated":
    case "group_expense":
    case "expense_comment_added":
    case "expense_mentioned":
      return data.expenseId ? `/expenses?id=${encodeURIComponent(String(data.expenseId))}` : "/expenses";
    case "expense_deleted":
      return "/expenses";
    case "settlement_recorded":
    case "settlement_added":
    case "payment_received":
      return "/settlements";
    case "friend_request":
    case "friend_accepted":
    case "friend_removed":
      return "/friends";
    case "group_invitation":
      return data.groupId ? `/groups/${encodeURIComponent(String(data.groupId))}` : "/groups";
    case "note_share_invite":
    case "note_share_accepted":
      return "/notes";
    default:
      return "/dashboard";
  }
}

async function sendPushForNotification(params: CreateNotificationParams): Promise<void> {
  if (params.skipPush) return;
  try {
    const { sendPushNotificationToUsers } = await import(
      "@/lib/firebase-messaging-admin"
    );
    const data = params.data || {};
    const url = pushUrlForType(params.type, data);
    await sendPushNotificationToUsers([toId(params.userId)], {
      title: pushTitleForType(params.type),
      body: params.message,
      url,
      data: {
        type: params.type,
        url,
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)])
        ),
      },
    });
  } catch (error) {
    console.error("Failed to send push for notification:", error);
  }
}

/**
 * Create a single notification for a user (DynamoDB + FCM push).
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const id = newId();
    const now = new Date();
    const notif: DdbNotification = {
      PK: PK.user(toId(params.userId)),
      SK: SK.notification(toSortableTs(now), id),
      entityType: "notification",
      ttl: ttlDaysFromNow(30),
      id,
      user_id: toId(params.userId),
      type: params.type,
      title: params.type,
      message: params.message,
      data: params.data || {},
      is_read: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: notif }));
    await sendPushForNotification(params);
    return notif;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Create notifications for multiple users (DynamoDB + FCM push each).
 */
export async function createNotifications(notifications: CreateNotificationParams[]) {
  try {
    if (notifications.length === 0) return [];

    const now = new Date();
    const items = notifications.map((n) => {
      const id = newId();
      return {
        PK: PK.user(toId(n.userId)),
        SK: SK.notification(toSortableTs(now), id),
        entityType: "notification",
        ttl: ttlDaysFromNow(30),
        id,
        user_id: toId(n.userId),
        type: n.type,
        title: n.type,
        message: n.message,
        data: n.data || {},
        is_read: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      } satisfies DdbNotification;
    });

    const client = getDynamoDB();
    const chunks = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE]: chunk.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        })
      );
    }

    await Promise.allSettled(
      notifications.map((n) => sendPushForNotification(n))
    );

    return items;
  } catch (error) {
    console.error("Error creating notifications:", error);
    throw error;
  }
}

/**
 * Notify participants about a new expense
 */
export async function notifyExpenseCreated(
  expenseId: IdLike,
  expenseDescription: string,
  amount: number,
  currency: string,
  createdBy: { id: IdLike; name: string },
  participantIds: IdLike[],
  groupName?: string
) {
  const notifications = participantIds
    .filter((id) => id.toString() !== createdBy.id.toString())
    .map((userId) => ({
      userId,
      type: groupName ? "group_expense" : "expense_added",
      message: groupName
        ? `${createdBy.name} added "${expenseDescription}" (${currency} ${amount.toFixed(2)}) in ${groupName}`
        : `${createdBy.name} added "${expenseDescription}" (${currency} ${amount.toFixed(2)})`,
      data: {
        expenseId: toId(expenseId),
        amount,
        currency,
        description: expenseDescription,
        createdByName: createdBy.name,
        groupName,
      },
    }));

  if (notifications.length > 0) {
    await createNotifications(notifications);
  }
}

/**
 * Notify participants about an updated expense
 */
export async function notifyExpenseUpdated(
  expenseId: IdLike,
  expenseDescription: string,
  updatedBy: { id: IdLike; name: string },
  participantIds: IdLike[]
) {
  const notifications = participantIds
    .filter((id) => id.toString() !== updatedBy.id.toString())
    .map((userId) => ({
      userId,
      type: "expense_updated",
      message: `${updatedBy.name} updated "${expenseDescription}"`,
      data: {
        expenseId: toId(expenseId),
        description: expenseDescription,
        updatedByName: updatedBy.name,
      },
    }));

  if (notifications.length > 0) {
    await createNotifications(notifications);
  }
}

/**
 * Notify participants about a deleted expense
 */
export async function notifyExpenseDeleted(
  expenseDescription: string,
  deletedBy: { id: IdLike; name: string },
  participantIds: IdLike[]
) {
  const notifications = participantIds
    .filter((id) => id.toString() !== deletedBy.id.toString())
    .map((userId) => ({
      userId,
      type: "expense_deleted",
      message: `${deletedBy.name} deleted "${expenseDescription}"`,
      data: {
        description: expenseDescription,
        deletedByName: deletedBy.name,
      },
    }));

  if (notifications.length > 0) {
    await createNotifications(notifications);
  }
}

/**
 * Notify about a settlement
 */
export async function notifySettlement(
  settlementId: IdLike,
  fromUser: { id: IdLike; name: string },
  toUser: { id: IdLike; name: string },
  amount: number,
  currency: string,
  currentUserId: IdLike
) {
  const recipientId =
    currentUserId.toString() === fromUser.id.toString()
      ? toUser.id
      : fromUser.id;

  await createNotification({
    userId: recipientId,
    type: "settlement_recorded",
    message: `${
      currentUserId.toString() === fromUser.id.toString()
        ? fromUser.name
        : toUser.name
    } recorded a payment of ${currency} ${amount.toFixed(2)}`,
    data: {
      settlementId: toId(settlementId),
      fromUserId: toId(fromUser.id),
      fromUserName: fromUser.name,
      toUserId: toId(toUser.id),
      toUserName: toUser.name,
      amount,
      currency,
    },
  });
}

/**
 * Notify about a friend request
 */
export async function notifyFriendRequest(
  fromUser: { id: IdLike; name: string },
  toUserId: IdLike
) {
  await createNotification({
    userId: toUserId,
    type: "friend_request",
    message: `${fromUser.name} sent you a friend request`,
    data: {
      fromUserId: toId(fromUser.id),
      fromUserName: fromUser.name,
    },
  });
}

/**
 * Notify about a friend request acceptance
 */
export async function notifyFriendAccepted(
  acceptedBy: { id: IdLike; name: string },
  requesterId: IdLike
) {
  await createNotification({
    userId: requesterId,
    type: "friend_accepted",
    message: `${acceptedBy.name} accepted your friend request`,
    data: {
      friendId: toId(acceptedBy.id),
      friendName: acceptedBy.name,
    },
  });
}

/**
 * Notify the other user that friendship was removed
 */
export async function notifyFriendRemoved(
  removedBy: { id: IdLike; name: string },
  otherUserId: IdLike
) {
  await createNotification({
    userId: otherUserId,
    type: "friend_removed",
    message: `${removedBy.name} removed you as a friend`,
    data: {
      friendId: toId(removedBy.id),
      friendName: removedBy.name,
    },
  });
}

/**
 * Notify about a group invitation / being added to a group
 */
export async function notifyGroupInvitation(
  groupId: IdLike,
  groupName: string,
  invitedBy: { id: IdLike; name: string },
  invitedUserId: IdLike
) {
  await createNotification({
    userId: invitedUserId,
    type: "group_invitation",
    message: `${invitedBy.name} added you to "${groupName}"`,
    data: {
      groupId: toId(groupId),
      groupName,
      invitedByName: invitedBy.name,
    },
  });
}

/**
 * Notify a friend that a note was shared with them (pending accept).
 */
export async function notifyNoteShareInvite(params: {
  noteId: IdLike;
  noteTitle: string;
  invitedBy: { id: IdLike; name: string };
  invitedUserId: IdLike;
}) {
  const title = params.noteTitle?.trim() || "Untitled note";
  await createNotification({
    userId: params.invitedUserId,
    type: "note_share_invite",
    message: `${params.invitedBy.name} invited you to collaborate on "${title}"`,
    data: {
      noteId: toId(params.noteId),
      noteTitle: title,
      invitedById: toId(params.invitedBy.id),
      invitedByName: params.invitedBy.name,
    },
  });
}

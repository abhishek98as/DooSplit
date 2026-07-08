import crypto from "crypto";
import { Notification } from "@/lib/mongodb/models";

type IdLike = string | { toString(): string };

export interface CreateNotificationParams {
  userId: IdLike;
  type: string;
  message: string;
  data?: Record<string, any>;
}

function newId(): string {
  return crypto.randomBytes(12).toString("hex");
}

function toId(value: IdLike): string {
  return typeof value === "string" ? value : value.toString();
}

/**
 * Create a single notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const doc = await Notification.create({
      _id: newId(),
      user_id: toId(params.userId),
      type: params.type,
      title: params.type,
      body: params.message,
      data: params.data || {},
      is_read: false,
      created_at: new Date(),
    });
    return doc;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 */
export async function createNotifications(notifications: CreateNotificationParams[]) {
  try {
    if (notifications.length === 0) return [];

    const rows = notifications.map((n) => ({
      _id: newId(),
      user_id: toId(n.userId),
      type: n.type,
      title: n.type,
      body: n.message,
      data: n.data || {},
      is_read: false,
      created_at: new Date(),
    }));

    const docs = await Notification.insertMany(rows, { ordered: false });
    return docs;
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
  // Notify the other party (not the current user)
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
 * Notify about a group invitation
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
    message: `${invitedBy.name} invited you to join "${groupName}"`,
    data: {
      groupId: toId(groupId),
      groupName,
      invitedByName: invitedBy.name,
    },
  });
}

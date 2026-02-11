import dbConnect from "@/lib/db";
import Notification from "@/models/Notification";
import mongoose from "mongoose";
import { mirrorUpsertToSupabase } from "@/lib/data";

export interface CreateNotificationParams {
  userId: mongoose.Types.ObjectId | string;
  type: string;
  message: string;
  data?: Record<string, any>;
}

/**
 * Create a single notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    await dbConnect();
    
    const notification = await Notification.create({
      userId: params.userId,
      type: params.type,
      message: params.message,
      data: params.data || {},
      isRead: false,
    });

    await mirrorUpsertToSupabase("notifications", notification._id.toString(), {
      id: notification._id.toString(),
      user_id: notification.userId.toString(),
      type: notification.type,
      message: notification.message,
      data: notification.data || {},
      is_read: !!notification.isRead,
      created_at: notification.createdAt,
      updated_at: notification.updatedAt,
    });

    return notification;
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
    await dbConnect();
    
    const created = await Notification.insertMany(
      notifications.map((n) => ({
        userId: n.userId,
        type: n.type,
        message: n.message,
        data: n.data || {},
        isRead: false,
      }))
    );

    for (const notification of created) {
      await mirrorUpsertToSupabase("notifications", notification._id.toString(), {
        id: notification._id.toString(),
        user_id: notification.userId.toString(),
        type: notification.type,
        message: notification.message,
        data: notification.data || {},
        is_read: !!notification.isRead,
        created_at: notification.createdAt,
        updated_at: notification.updatedAt,
      });
    }

    return created;
  } catch (error) {
    console.error("Error creating notifications:", error);
    throw error;
  }
}

/**
 * Notify participants about a new expense
 */
export async function notifyExpenseCreated(
  expenseId: mongoose.Types.ObjectId | string,
  expenseDescription: string,
  amount: number,
  currency: string,
  createdBy: { id: mongoose.Types.ObjectId | string; name: string },
  participantIds: (mongoose.Types.ObjectId | string)[],
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
        expenseId: expenseId.toString(),
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
  expenseId: mongoose.Types.ObjectId | string,
  expenseDescription: string,
  updatedBy: { id: mongoose.Types.ObjectId | string; name: string },
  participantIds: (mongoose.Types.ObjectId | string)[]
) {
  const notifications = participantIds
    .filter((id) => id.toString() !== updatedBy.id.toString())
    .map((userId) => ({
      userId,
      type: "expense_updated",
      message: `${updatedBy.name} updated "${expenseDescription}"`,
      data: {
        expenseId: expenseId.toString(),
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
  deletedBy: { id: mongoose.Types.ObjectId | string; name: string },
  participantIds: (mongoose.Types.ObjectId | string)[]
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
  settlementId: mongoose.Types.ObjectId | string,
  fromUser: { id: mongoose.Types.ObjectId | string; name: string },
  toUser: { id: mongoose.Types.ObjectId | string; name: string },
  amount: number,
  currency: string,
  currentUserId: mongoose.Types.ObjectId | string
) {
  // Notify the other party (not the current user)
  const recipientId =
    currentUserId.toString() === fromUser.id.toString()
      ? toUser.id
      : fromUser.id;
  const recipientName =
    currentUserId.toString() === fromUser.id.toString()
      ? toUser.name
      : fromUser.name;

  await createNotification({
    userId: recipientId,
    type: "settlement_recorded",
    message: `${
      currentUserId.toString() === fromUser.id.toString()
        ? fromUser.name
        : toUser.name
    } recorded a payment of ${currency} ${amount.toFixed(2)}`,
    data: {
      settlementId: settlementId.toString(),
      fromUserId: fromUser.id.toString(),
      fromUserName: fromUser.name,
      toUserId: toUser.id.toString(),
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
  fromUser: { id: mongoose.Types.ObjectId | string; name: string },
  toUserId: mongoose.Types.ObjectId | string
) {
  await createNotification({
    userId: toUserId,
    type: "friend_request",
    message: `${fromUser.name} sent you a friend request`,
    data: {
      fromUserId: fromUser.id.toString(),
      fromUserName: fromUser.name,
    },
  });
}

/**
 * Notify about a friend request acceptance
 */
export async function notifyFriendAccepted(
  acceptedBy: { id: mongoose.Types.ObjectId | string; name: string },
  requesterId: mongoose.Types.ObjectId | string
) {
  await createNotification({
    userId: requesterId,
    type: "friend_accepted",
    message: `${acceptedBy.name} accepted your friend request`,
    data: {
      friendId: acceptedBy.id.toString(),
      friendName: acceptedBy.name,
    },
  });
}

/**
 * Notify about a group invitation
 */
export async function notifyGroupInvitation(
  groupId: mongoose.Types.ObjectId | string,
  groupName: string,
  invitedBy: { id: mongoose.Types.ObjectId | string; name: string },
  invitedUserId: mongoose.Types.ObjectId | string
) {
  await createNotification({
    userId: invitedUserId,
    type: "group_invitation",
    message: `${invitedBy.name} invited you to join "${groupName}"`,
    data: {
      groupId: groupId.toString(),
      groupName,
      invitedByName: invitedBy.name,
    },
  });
}

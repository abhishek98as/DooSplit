/**
 * Activity Logger
 *
 * Writes immutable activity_log entries to Firestore whenever a mutation occurs.
 * This gives us a true, permanent audit trail that survives friend removals,
 * group deletions, and expense edits.
 *
 * Collection: activity_logs
 * Document shape:
 *   userId     — the user who should see this event in their feed
 *   actorId    — the user who performed the action
 *   actorName  — denormalized name (avoids extra lookups on read)
 *   type       — activity type string
 *   title      — short human-readable title
 *   description — full human-readable sentence
 *   metadata   — type-specific extra data (amounts, IDs, names)
 *   createdAt  — server timestamp
 */

import { FieldValue, getAdminDb } from "@/lib/firestore/admin";

export type ActivityType =
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "friend_added"
  | "friend_removed"
  | "friend_request_sent"
  | "group_created"
  | "group_deleted"
  | "group_member_added"
  | "settlement_added";

export interface LogActivityInput {
  /** UIDs of everyone who should see this event (can be multiple) */
  userIds: string[];
  /** Who performed the action */
  actorId: string;
  actorName: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Write one activity log entry per user in userIds.
 * Fire-and-forget: never throws — wrapped in try/catch so mutations are not blocked.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const db = getAdminDb();
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    const uniqueUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;

    for (const userId of uniqueUserIds) {
      const ref = db.collection("activity_logs").doc();
      batch.set(ref, {
        userId,
        actorId: input.actorId,
        actorName: input.actorName,
        type: input.type,
        title: input.title,
        description: input.description,
        metadata: input.metadata || {},
        createdAt: now,
        // ISO string alongside server timestamp for easy client querying
        createdAtIso: new Date().toISOString(),
      });
    }

    await batch.commit();
  } catch (err) {
    // Never block the main operation
    console.error("[activity-logger] Failed to write activity log:", err);
  }
}

/**
 * Convenience: log an expense_added event for all participants.
 */
export async function logExpenseAdded(params: {
  actorId: string;
  actorName: string;
  expenseId: string;
  description: string;
  amount: number;
  currency: string;
  groupId?: string | null;
  groupName?: string | null;
  participantIds: string[];
}) {
  const { actorId, actorName, expenseId, description, amount, currency, groupId, groupName, participantIds } = params;
  const formattedAmount = new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount);
  const locationText = groupName ? ` in "${groupName}"` : "";

  await logActivity({
    userIds: Array.from(new Set([actorId, ...participantIds])),
    actorId,
    actorName,
    type: "expense_added",
    title: "Expense Added",
    description: `${actorName} added "${description}" for ${formattedAmount}${locationText}`,
    metadata: {
      expenseId,
      amount,
      currency,
      expenseDescription: description,
      groupId: groupId || null,
      groupName: groupName || null,
      expenseType: groupId ? "group" : "non-group",
    },
  });
}

/**
 * Convenience: log an expense_updated event.
 */
export async function logExpenseUpdated(params: {
  actorId: string;
  actorName: string;
  expenseId: string;
  description: string;
  amount: number;
  currency: string;
  participantIds: string[];
  diff?: Record<string, any>;
}) {
  const { actorId, actorName, expenseId, description, amount, currency, participantIds, diff } = params;
  const formattedAmount = new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount);

  await logActivity({
    userIds: Array.from(new Set([actorId, ...participantIds])),
    actorId,
    actorName,
    type: "expense_updated",
    title: "Expense Updated",
    description: `${actorName} updated "${description}" (${formattedAmount})`,
    metadata: {
      expenseId,
      amount,
      currency,
      expenseDescription: description,
      diff: diff || {},
    },
  });
}

/**
 * Convenience: log an expense_deleted event.
 */
export async function logExpenseDeleted(params: {
  actorId: string;
  actorName: string;
  expenseId: string;
  description: string;
  amount: number;
  currency: string;
  participantIds: string[];
  before?: Record<string, any>;
  after?: Record<string, any>;
}) {
  const { actorId, actorName, expenseId, description, amount, currency, participantIds, before, after } = params;
  const formattedAmount = new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount);

  await logActivity({
    userIds: Array.from(new Set([actorId, ...participantIds])),
    actorId,
    actorName,
    type: "expense_deleted",
    title: "Expense Deleted",
    description: `${actorName} deleted "${description}" (${formattedAmount})`,
    metadata: {
      expenseId,
      amount,
      currency,
      expenseDescription: description,
      before: before || null,
      after: after || { isDeleted: true },
    },
  });
}

/**
 * Convenience: log a friend_added event for both users.
 */
export async function logFriendAdded(params: {
  userId: string;
  userName: string;
  friendId: string;
  friendName: string;
}) {
  const { userId, userName, friendId, friendName } = params;
  // Log for user: "You became friends with friendName"
  await logActivity({
    userIds: [userId],
    actorId: userId,
    actorName: userName,
    type: "friend_added",
    title: "New Friend",
    description: `You became friends with ${friendName}`,
    metadata: { friendId, friendName },
  });
  // Log for friend: "You became friends with userName"
  await logActivity({
    userIds: [friendId],
    actorId: userId,
    actorName: userName,
    type: "friend_added",
    title: "New Friend",
    description: `You became friends with ${userName}`,
    metadata: { friendId: userId, friendName: userName },
  });
}

/**
 * Convenience: log a friend_removed event for both users.
 */
export async function logFriendRemoved(params: {
  userId: string;
  userName: string;
  friendId: string;
  friendName: string;
}) {
  const { userId, userName, friendId, friendName } = params;
  await logActivity({
    userIds: [userId],
    actorId: userId,
    actorName: userName,
    type: "friend_removed",
    title: "Friend Removed",
    description: `You removed ${friendName} from your friends`,
    metadata: { friendId, friendName },
  });
  await logActivity({
    userIds: [friendId],
    actorId: userId,
    actorName: userName,
    type: "friend_removed",
    title: "Removed from Friends",
    description: `${userName} removed you from their friends`,
    metadata: { friendId: userId, friendName: userName },
  });
}

/**
 * Convenience: log a group_created event for all members.
 */
export async function logGroupCreated(params: {
  actorId: string;
  actorName: string;
  groupId: string;
  groupName: string;
  memberIds: string[];
}) {
  const { actorId, actorName, groupId, groupName, memberIds } = params;
  await logActivity({
    userIds: Array.from(new Set([actorId, ...memberIds])),
    actorId,
    actorName,
    type: "group_created",
    title: "Group Created",
    description: `${actorName} created group "${groupName}"`,
    metadata: { groupId, groupName },
  });
}

/**
 * Convenience: log a group_deleted event for all members.
 */
export async function logGroupDeleted(params: {
  actorId: string;
  actorName: string;
  groupId: string;
  groupName: string;
  memberIds: string[];
}) {
  const { actorId, actorName, groupId, groupName, memberIds } = params;
  await logActivity({
    userIds: Array.from(new Set([actorId, ...memberIds])),
    actorId,
    actorName,
    type: "group_deleted",
    title: "Group Deleted",
    description: `${actorName} deleted group "${groupName}"`,
    metadata: { groupId, groupName },
  });
}

/**
 * Convenience: log a settlement_added event for both parties.
 */
export async function logSettlementAdded(params: {
  actorId: string;
  actorName: string;
  settlementId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
  currency: string;
  groupId?: string | null;
  groupName?: string | null;
}) {
  const { actorId, actorName, settlementId, fromUserId, fromUserName, toUserId, toUserName, amount, currency, groupId, groupName } = params;
  const formattedAmount = new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount);
  const locationText = groupName ? ` (${groupName})` : "";

  await logActivity({
    userIds: Array.from(new Set([fromUserId, toUserId])),
    actorId,
    actorName,
    type: "settlement_added",
    title: "Payment Settled",
    description: `${fromUserName} paid ${toUserName} ${formattedAmount}${locationText}`,
    metadata: {
      settlementId,
      fromUserId,
      fromUserName,
      toUserId,
      toUserName,
      amount,
      currency,
      groupId: groupId || null,
      groupName: groupName || null,
    },
  });
}

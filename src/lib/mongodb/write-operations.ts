import "server-only";
import { getMongoDb, getMongooseInstance } from "./client";
import { newAppId } from "@/lib/ids";
import { groupMemberDocId } from "@/lib/social/keys";
import { COLLECTIONS } from "./collections";
import {
  Expense,
  ExpenseParticipant,
  Group,
  GroupMember,
  Settlement,
  Friendship,
} from "./models";

// ── Expense Creation (transactional) ──
// Replaces createExpenseInFirestore — uses MongoDB multi-document transaction

export async function createExpenseInMongo(
  expenseData: Record<string, unknown>,
  participants: Array<Record<string, unknown>>
): Promise<string> {
  const mongoose = getMongooseInstance();
  const expenseId = newAppId();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Expense.create(
        [
          {
            _id: expenseId,
            ...expenseData,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        { session }
      );

      const participantDocs = participants.map((p) => ({
        _id: newAppId(),
        ...p,
        expense_id: expenseId,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      await ExpenseParticipant.insertMany(participantDocs, { session });
    });

    return expenseId;
  } finally {
    await session.endSession();
  }
}

// ── Group Creation (transactional) ──
// Replaces createGroupInFirestore

export async function createGroupInMongo(
  groupData: Record<string, unknown>,
  memberIds: string[]
): Promise<string> {
  const mongoose = getMongooseInstance();
  const groupId = newAppId();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Group.create(
        [
          {
            _id: groupId,
            ...groupData,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        { session }
      );

      const memberDocs = memberIds.map((userId) => ({
        _id: groupMemberDocId(groupId, userId),
        group_id: groupId,
        user_id: userId,
        role: userId === groupData.created_by ? "admin" : "member",
        joined_at: new Date(),
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      }));

      await GroupMember.insertMany(memberDocs, { session });
    });

    return groupId;
  } finally {
    await session.endSession();
  }
}

// ── Settlement Creation ──
// Replaces createSettlementInFirestore

export async function createSettlementInMongo(
  settlementData: Record<string, unknown>
): Promise<string> {
  const settlementId = newAppId();

  await Settlement.create({
    _id: settlementId,
    ...settlementData,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return settlementId;
}

// ── Friendship Creation ──
// Delegates to friendship-store (which will be rewritten in Phase 3)
// This is a placeholder that the social layer will call directly.

export async function createFriendshipInMongo(
  friendshipData: Record<string, unknown>
): Promise<void> {
  const friendshipId = newAppId();

  await Friendship.create({
    _id: friendshipId,
    ...friendshipData,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

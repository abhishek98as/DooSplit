import { getAdminDb, FieldValue } from "./admin";
import { COLLECTIONS } from "./collections";
import { newAppId } from "@/lib/ids";
import { groupMemberDocId } from "@/lib/social/keys";
import { upsertBidirectionalFriendship } from "@/lib/social/friendship-store";

export async function createExpenseInFirestore(expenseData: any, participants: any[]) {
  const db = getAdminDb();
  const expenseId = newAppId();
  const batch = db.batch();

  // Create expense document
  const expenseRef = db.collection(COLLECTIONS.expenses).doc(expenseId);
  batch.set(expenseRef, {
    ...expenseData,
    id: expenseId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // Create participant documents
  for (const participant of participants) {
    const participantRef = db.collection(COLLECTIONS.expenseParticipants).doc(newAppId());
    batch.set(participantRef, {
      ...participant,
      expense_id: expenseId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return expenseId;
}

export async function createGroupInFirestore(groupData: any, memberIds: string[]) {
  const db = getAdminDb();
  const groupId = newAppId();
  const batch = db.batch();

  const groupRef = db.collection(COLLECTIONS.groups).doc(groupId);
  batch.set(groupRef, {
    ...groupData,
    id: groupId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  for (const userId of memberIds) {
    const memberRef = db
      .collection(COLLECTIONS.groupMembers)
      .doc(groupMemberDocId(groupId, userId));
    batch.set(memberRef, {
      id: memberRef.id,
      group_id: groupId,
      user_id: userId,
      role: userId === groupData.created_by ? "admin" : "member",
      joined_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return groupId;
}

export async function createSettlementInFirestore(settlementData: any) {
  const db = getAdminDb();
  const settlementId = newAppId();

  const settlementRef = db.collection(COLLECTIONS.settlements).doc(settlementId);
  await settlementRef.set({
    ...settlementData,
    id: settlementId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return settlementId;
}

export async function createFriendshipInFirestore(friendshipData: any) {
  const userId = String(friendshipData?.user_id || "");
  const friendId = String(friendshipData?.friend_id || "");
  const requestedBy = String(friendshipData?.requested_by || userId);

  if (!userId || !friendId || userId === friendId) {
    throw new Error("Invalid friendship payload");
  }

  const result = await upsertBidirectionalFriendship({
    userId,
    friendId,
    status: friendshipData?.status || "pending",
    requestedBy,
  });

  return result.forwardId;
}

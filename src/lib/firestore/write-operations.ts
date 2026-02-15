import { getAdminDb, FieldValue } from "./admin";
import { COLLECTIONS } from "./collections";
import { newAppId } from "@/lib/ids";

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
    const memberRef = db.collection(COLLECTIONS.groupMembers).doc(newAppId());
    batch.set(memberRef, {
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
  const db = getAdminDb();
  const friendshipId = newAppId();
  const reverseId = newAppId();

  const batch = db.batch();

  // Forward friendship
  const forwardRef = db.collection(COLLECTIONS.friendships).doc(friendshipId);
  batch.set(forwardRef, {
    ...friendshipData,
    id: friendshipId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // Reverse friendship
  const reverseRef = db.collection(COLLECTIONS.friendships).doc(reverseId);
  batch.set(reverseRef, {
    user_id: friendshipData.friend_id,
    friend_id: friendshipData.user_id,
    status: friendshipData.status,
    requested_by: friendshipData.requested_by,
    id: reverseId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return friendshipId;
}
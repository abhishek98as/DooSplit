import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { invalidateUsersCache } from "@/lib/cache";
import {
  normalizeEmail,
  normalizeName,
} from "@/lib/social/keys";
import { getDynamoDB } from "@/lib/dynamodb/client";
import { TABLE } from "@/lib/dynamodb/tables";
import { PK, SK, GSI1PK } from "@/lib/dynamodb/keys";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function processInviteDynamo(inviteToken: string, newUserId: string): Promise<{ inviterId: string | null; friendAdded: boolean }> {
  const { getInvitationByToken, putInvitation } = await import("@/lib/dynamodb/entities/invitations");
  const { putFriendshipBidirectional } = await import("@/lib/dynamodb/entities/friendships");
  const { getUserById } = await import("@/lib/dynamodb/entities/users");

  const invite = await getInvitationByToken(inviteToken);
  if (!invite) {
    return { inviterId: null, friendAdded: false };
  }

  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  if (invite.status !== "pending" || (expiresAt && expiresAt < new Date())) {
    return { inviterId: null, friendAdded: false };
  }

  const inviterId = invite.invited_by;
  if (!inviterId) {
    return { inviterId: null, friendAdded: false };
  }

  const now = new Date().toISOString();
  await putInvitation({
    ...invite,
    status: "accepted",
    updated_at: now,
  });

  await putFriendshipBidirectional({
    id: invite.id,
    user_id: newUserId,
    friend_id: inviterId,
    status: "accepted",
    requested_by: inviterId,
    created_at: now,
    updated_at: now,
  });

  const { logFriendAdded } = await import("@/lib/activity-logger");
  const [newUser, inviterUser] = await Promise.all([
    getUserById(newUserId),
    getUserById(inviterId),
  ]);
  if (newUser && inviterUser) {
    void logFriendAdded({
      userId: newUserId,
      userName: newUser.name || "New Friend",
      friendId: inviterId,
      friendName: inviterUser.name || "A friend",
    });
  }

  return { inviterId, friendAdded: true };
}

async function processReferralDynamo(
  inviterRef: string,
  newUserId: string
): Promise<{ inviterId: string | null; friendAdded: boolean }> {
  const { putFriendshipBidirectional } = await import("@/lib/dynamodb/entities/friendships");
  const { getUserById } = await import("@/lib/dynamodb/entities/users");

  const inviterId = String(inviterRef || "").trim();
  if (!inviterId || inviterId === newUserId) {
    return { inviterId: null, friendAdded: false };
  }

  const inviter = await getUserById(inviterId);
  if (!inviter) {
    return { inviterId: null, friendAdded: false };
  }

  const now = new Date().toISOString();
  await putFriendshipBidirectional({
    id: `${newUserId}_${inviterId}`,
    user_id: newUserId,
    friend_id: inviterId,
    status: "accepted",
    requested_by: inviterId,
    created_at: now,
    updated_at: now,
  });

  const { logFriendAdded } = await import("@/lib/activity-logger");
  const newUser = await getUserById(newUserId);
  if (newUser) {
    void logFriendAdded({
      userId: newUserId,
      userName: newUser.name || "New Friend",
      friendId: inviterId,
      friendName: inviter.name || "A friend",
    });
  }

  return { inviterId, friendAdded: true };
}

async function mergeDummyFriendsDynamo(inviterId: string, newUserId: string, targetName: string) {
  const { listDummiesCreatedByUser, putUser, updateUser } = await import("@/lib/dynamodb/entities/users");
  const { listFriendshipsForUser, putFriendshipBidirectional, deleteFriendshipBidirectional } = await import("@/lib/dynamodb/entities/friendships");
  const { getExpenseParticipant, updateExpenseParticipant, putExpenseParticipant } = await import("@/lib/dynamodb/entities/expenses");

  const dummies = await listDummiesCreatedByUser(inviterId);
  const matchingDummies = dummies.filter((doc: any) => {
    const name = String(doc.name || "").trim().toLowerCase();
    return name === targetName.trim().toLowerCase();
  });

  let merged = 0;
  const db = getDynamoDB();

  for (const dummy of matchingDummies) {
    const dummyId = dummy.id;
    const migratedPairs = new Set<string>();

    const links = await listFriendshipsForUser(dummyId);

    for (const row of links) {
      const nextUserId = row.user_id === dummyId ? newUserId : row.user_id;
      const nextFriendId = row.friend_id === dummyId ? newUserId : row.friend_id;
      const nextStatus = row.status || "accepted";
      const nextRequestedBy = row.requested_by || inviterId;

      if (nextUserId !== nextFriendId) {
        const pairKey = `${nextUserId}:${nextFriendId}`;
        if (!migratedPairs.has(pairKey)) {
          const nowStr = new Date().toISOString();
          await putFriendshipBidirectional({
            id: row.id,
            user_id: nextUserId,
            friend_id: nextFriendId,
            status: nextStatus as any,
            requested_by: nextRequestedBy,
            created_at: row.created_at || nowStr,
            updated_at: nowStr,
          });
          migratedPairs.add(pairKey);
        }
      }

      await deleteFriendshipBidirectional(row.user_id, row.friend_id);
    }

    const { GSI1 } = await import("@/lib/dynamodb/tables");
    const partRes = await db.send(new QueryCommand({
      TableName: TABLE,
      IndexName: GSI1,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": GSI1PK.expPart(dummyId) },
    }));
    const dummyParticipants = (partRes.Items || []) as any[];

    for (const participant of dummyParticipants) {
      const expenseId = participant.expense_id;
      const existingParticipant = await getExpenseParticipant(expenseId, newUserId);

      if (existingParticipant) {
        const paid = Number(existingParticipant.amount_paid || 0) + Number(participant.amount_paid || 0);
        const owed = Number(existingParticipant.amount_owed || 0) + Number(participant.amount_owed || 0);
        await updateExpenseParticipant(expenseId, newUserId, {
          amount_paid: paid,
          amount_owed: owed,
          is_settled: existingParticipant.is_settled && participant.is_settled,
          updated_at: new Date().toISOString(),
        });
      } else {
        await putExpenseParticipant({
          expense_id: expenseId,
          user_id: newUserId,
          amount_paid: participant.amount_paid,
          amount_owed: participant.amount_owed,
          is_settled: participant.is_settled,
          is_excluded: participant.is_excluded,
          expense_date: participant.expense_date,
          created_at: participant.created_at,
          updated_at: new Date().toISOString(),
        });
      }

      await db.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: PK.expense(expenseId), SK: SK.part(dummyId) }
      }));
    }

    await db.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: PK.user(dummyId), SK: SK.profile }
    }));

    merged += 1;
  }

  return merged;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json().catch(() => ({}));
    const inviteToken = typeof body?.inviteToken === "string" ? body.inviteToken : "";
    const inviterRef = typeof body?.ref === "string"
      ? body.ref
      : typeof body?.inviterRef === "string"
      ? body.inviterRef
      : "";
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";

    const fallbackName = rawName || auth.user.name || "User";
    const fallbackEmail = auth.user.email || "";
    const fallbackPhoto = auth.user.profilePicture || "";

    let isNewUser = false;

    const { getUserById, putUser, updateUser } = await import("@/lib/dynamodb/entities/users");
    const existing = await getUserById(auth.user.id);
    isNewUser = !existing;
    const now = new Date().toISOString();
    if (existing) {
      await updateUser(auth.user.id, {
        name: fallbackName,
        name_normalized: normalizeName(fallbackName),
        photo_url: fallbackPhoto || existing.photo_url || undefined,
        updated_at: now,
      });
    } else {
      await putUser({
        id: auth.user.id,
        email: fallbackEmail,
        email_normalized: normalizeEmail(fallbackEmail),
        name: fallbackName,
        name_normalized: normalizeName(fallbackName),
        photo_url: fallbackPhoto,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    }

    let inviterId: string | null = null;
    let friendAdded = false;
    let dummyMerged = 0;

    if (inviteToken) {
      const inviteResult = await processInviteDynamo(inviteToken, auth.user.id);
      inviterId = inviteResult.inviterId;
      friendAdded = inviteResult.friendAdded;
    } else if (inviterRef) {
      const referralResult = await processReferralDynamo(inviterRef, auth.user.id);
      inviterId = referralResult.inviterId;
      friendAdded = referralResult.friendAdded;
    }

    if (inviterId && fallbackName) {
      dummyMerged = await mergeDummyFriendsDynamo(inviterId, auth.user.id, fallbackName);
    }

    if (inviterId && (friendAdded || dummyMerged > 0)) {
      await invalidateUsersCache(
        [auth.user.id, inviterId],
        ["friends", "activities", "dashboard-activity", "friend-details", "analytics"]
      );
    }

    return NextResponse.json(
      {
        message: "User bootstrap complete",
        user: {
          id: auth.user.id,
          email: fallbackEmail,
          name: fallbackName,
        },
        friendAdded,
        dummyMerged,
      },
      { status: isNewUser ? 201 : 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to bootstrap user" },
      { status: 500 }
    );
  }
}

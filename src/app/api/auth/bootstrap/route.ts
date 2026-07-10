import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { invalidateUsersCache } from "@/lib/cache";
import {
  friendshipPairKey,
  normalizeEmail,
  normalizeName,
} from "@/lib/social/keys";
import { upsertBidirectionalFriendship } from "@/lib/social/friendship-store";
import { User, Friendship, Invitation, ExpenseParticipant } from "@/lib/mongodb/models";
import { newAppId } from "@/lib/ids";
import { getMongoDb } from "@/lib/mongodb/client";
import { getDataBackendMode } from "@/lib/data/config";

export const dynamic = "force-dynamic";

async function mergeDummyFriends(inviterId: string, newUserId: string, targetName: string) {
  const dummies = await User.find({
    is_dummy: true,
    created_by: inviterId,
  }).lean();

  const matchingDummies = dummies.filter((doc: any) => {
    const name = String(doc.name || "").trim().toLowerCase();
    return name === targetName.trim().toLowerCase();
  });

  let merged = 0;

  for (const dummy of matchingDummies) {
    const dummyId = String(dummy._id);
    const migratedPairs = new Set<string>();

    const [linksAsUser, linksAsFriend] = await Promise.all([
      Friendship.find({ user_id: dummyId }).lean(),
      Friendship.find({ friend_id: dummyId }).lean(),
    ]);

    for (const row of [...linksAsUser, ...linksAsFriend]) {
      const nextUserId = row.user_id === dummyId ? newUserId : String(row.user_id);
      const nextFriendId = row.friend_id === dummyId ? newUserId : String(row.friend_id);
      const nextStatus = row.status || "accepted";
      const nextRequestedBy = row.requested_by || inviterId;

      if (nextUserId !== nextFriendId) {
        const pairKey = friendshipPairKey(nextUserId, nextFriendId);
        if (!migratedPairs.has(pairKey)) {
          await upsertBidirectionalFriendship({
            userId: nextUserId,
            friendId: nextFriendId,
            status: nextStatus as "pending" | "accepted",
            requestedBy: nextRequestedBy,
          });
          migratedPairs.add(pairKey);
        }
      }

      await Friendship.deleteOne({ _id: row._id });
    }

    const dummyParticipants = await ExpenseParticipant.find({ user_id: dummyId }).lean();

    for (const participant of dummyParticipants) {
      const expenseId = String(participant.expense_id);
      const existingParticipant = await ExpenseParticipant.findOne({
        expense_id: expenseId,
        user_id: newUserId,
      }).lean();

      if (existingParticipant) {
        await ExpenseParticipant.updateOne(
          { _id: existingParticipant._id },
          {
            $inc: {
              amount_paid: Number((participant as any).paid_amount || participant.amount_paid || 0),
              amount_owed: Number((participant as any).owed_amount || participant.amount_owed || 0),
            },
            $set: {
              is_settled: Boolean(existingParticipant.is_settled) && Boolean(participant.is_settled),
              updated_at: new Date(),
            },
          }
        );
      } else {
        const { _id: _, ...participantData } = participant as any;
        await ExpenseParticipant.create({
          _id: newAppId(),
          ...participantData,
          user_id: newUserId,
          updated_at: new Date(),
        });
      }

      await ExpenseParticipant.deleteOne({ _id: participant._id });
    }

    await User.deleteOne({ _id: dummyId });
    merged += 1;
  }

  return merged;
}

async function processInvite(inviteToken: string, newUserId: string): Promise<{ inviterId: string | null; friendAdded: boolean }> {
  const invite = await Invitation.findOne({ token: inviteToken }).lean();

  if (!invite) {
    return { inviterId: null, friendAdded: false };
  }

  const expiresAt = (invite as any).expires_at ? new Date((invite as any).expires_at) : null;

  if (invite.status !== "pending" || (expiresAt && expiresAt < new Date())) {
    return { inviterId: null, friendAdded: false };
  }

  const inviterId = String(invite.invited_by || "");
  if (!inviterId) {
    return { inviterId: null, friendAdded: false };
  }

  await Invitation.updateOne(
    { _id: invite._id },
    {
      $set: {
        status: "accepted",
        updated_at: new Date(),
      },
    }
  );

  await upsertBidirectionalFriendship({
    userId: newUserId,
    friendId: inviterId,
    status: "accepted",
    requestedBy: inviterId,
  });

  return { inviterId, friendAdded: true };
}

async function processReferral(
  inviterRef: string,
  newUserId: string
): Promise<{ inviterId: string | null; friendAdded: boolean }> {
  const inviterId = String(inviterRef || "").trim();
  if (!inviterId || inviterId === newUserId) {
    return { inviterId: null, friendAdded: false };
  }

  const inviter = await User.findById(inviterId).lean();
  if (!inviter) {
    return { inviterId: null, friendAdded: false };
  }

  await upsertBidirectionalFriendship({
    userId: newUserId,
    friendId: inviterId,
    status: "accepted",
    requestedBy: inviterId,
  });

  return { inviterId, friendAdded: true };
}

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
  const { getUserById } = await import("@/lib/dynamodb/entities/users");
  const { putFriendshipBidirectional } = await import("@/lib/dynamodb/entities/friendships");

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
    id: newAppId(),
    user_id: newUserId,
    friend_id: inviterId,
    status: "accepted",
    requested_by: inviterId,
    created_at: now,
    updated_at: now,
  });

  const { logFriendAdded } = await import("@/lib/activity-logger");
  const newUser = await getUserById(newUserId);
  if (newUser && inviter) {
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
  const { ScanCommand, QueryCommand, DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
  const { TABLE } = await import("@/lib/dynamodb/tables");
  const { PK, SK, GSI1PK } = await import("@/lib/dynamodb/keys");
  const { getDynamoDB } = await import("@/lib/dynamodb/client");
  const db = getDynamoDB();

  const res = await db.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "entityType = :et AND is_dummy = :id AND created_by = :cb",
    ExpressionAttributeValues: {
      ":et": "user",
      ":id": true,
      ":cb": inviterId,
    }
  }));
  const dummies = (res.Items || []) as any[];

  const matchingDummies = dummies.filter((doc) => {
    const name = String(doc.name || "").trim().toLowerCase();
    return name === targetName.trim().toLowerCase();
  });

  let merged = 0;

  const { listFriendshipsForUser, putFriendshipBidirectional, deleteFriendshipBidirectional } = await import("@/lib/dynamodb/entities/friendships");
  const { getExpenseParticipant, putExpenseParticipant, updateExpenseParticipant } = await import("@/lib/dynamodb/entities/expenses");

  for (const dummy of matchingDummies) {
    const dummyId = dummy.id;
    const migratedPairs = new Set<string>();

    const friendships = await listFriendshipsForUser(dummyId);
    for (const row of friendships) {
      const nextUserId = row.user_id === dummyId ? newUserId : row.user_id;
      const nextFriendId = row.friend_id === dummyId ? newUserId : row.friend_id;
      const nextStatus = row.status || "accepted";
      const nextRequestedBy = row.requested_by || inviterId;

      if (nextUserId !== nextFriendId) {
        const pairKey = friendshipPairKey(nextUserId, nextFriendId);
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

    const backend = getDataBackendMode();
    let isNewUser = false;

    if (backend === "dynamodb") {
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
    } else {
      await getMongoDb();
      const existing = await User.findById(auth.user.id).lean();
      isNewUser = !existing;
      await User.findOneAndUpdate(
        { _id: auth.user.id },
        {
          $set: {
            email: fallbackEmail,
            email_normalized: normalizeEmail(fallbackEmail),
            name: fallbackName,
            name_normalized: normalizeName(fallbackName),
            role: "user",
            is_active: true,
            is_dummy: false,
            auth_provider: "firebase",
            email_verified: true,
            default_currency: existing?.default_currency || "INR",
            timezone: existing?.timezone || "Asia/Kolkata",
            language: existing?.language || "en",
            push_notifications_enabled: existing?.push_notifications_enabled || false,
            email_notifications_enabled: existing?.email_notifications_enabled !== false,
            profile_picture: fallbackPhoto || existing?.profile_picture || null,
            updated_at: new Date(),
          },
          $setOnInsert: {
            _id: auth.user.id,
            phone: null,
            fcm_tokens: [],
            created_by: null,
            created_at: existing?.created_at || new Date(),
          },
        },
        { upsert: true }
      );
    }

    let inviterId: string | null = null;
    let friendAdded = false;
    let dummyMerged = 0;

    if (backend === "dynamodb") {
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
    } else {
      if (inviteToken) {
        const inviteResult = await processInvite(inviteToken, auth.user.id);
        inviterId = inviteResult.inviterId;
        friendAdded = inviteResult.friendAdded;
      } else if (inviterRef) {
        const referralResult = await processReferral(inviterRef, auth.user.id);
        inviterId = referralResult.inviterId;
        friendAdded = referralResult.friendAdded;
      }

      if (inviterId && fallbackName) {
        dummyMerged = await mergeDummyFriends(inviterId, auth.user.id, fallbackName);
      }

      if (inviterId && (friendAdded || dummyMerged > 0)) {
        await invalidateUsersCache(
          [auth.user.id, inviterId],
          ["friends", "activities", "dashboard-activity", "friend-details", "analytics"]
        );
      }
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

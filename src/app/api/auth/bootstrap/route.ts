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
          updated_at: now,
        });
      } else {
        await putUser({
          id: auth.user.id,
          email: fallbackEmail,
          email_normalized: normalizeEmail(fallbackEmail),
          name: fallbackName,
          name_normalized: normalizeName(fallbackName),
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
            updated_at: new Date(),
          },
          $setOnInsert: {
            _id: auth.user.id,
            phone: null,
            profile_picture: null,
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

    if (backend !== "dynamodb") {
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

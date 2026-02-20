import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb, FieldValue } from "@/lib/firestore/admin";
import { newAppId } from "@/lib/ids";
import { invalidateUsersCache } from "@/lib/cache";
import {
  friendshipPairKey,
  normalizeEmail,
  normalizeName,
} from "@/lib/social/keys";
import { upsertBidirectionalFriendship } from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";

async function mergeDummyFriends(inviterId: string, newUserId: string, targetName: string) {
  const db = getAdminDb();

  const dummiesSnap = await db
    .collection("users")
    .where("is_dummy", "==", true)
    .where("created_by", "==", inviterId)
    .get();

  const dummies = dummiesSnap.docs.filter((doc) => {
    const name = String(doc.data().name || "").trim().toLowerCase();
    return name === targetName.trim().toLowerCase();
  });

  let merged = 0;

  for (const dummyDoc of dummies) {
    const dummyId = dummyDoc.id;
    const migratedPairs = new Set<string>();

    const [linksAsUser, linksAsFriend] = await Promise.all([
      db.collection("friendships").where("user_id", "==", dummyId).get(),
      db.collection("friendships").where("friend_id", "==", dummyId).get(),
    ]);

    for (const doc of [...linksAsUser.docs, ...linksAsFriend.docs]) {
      const row = doc.data();
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
            status: nextStatus,
            requestedBy: nextRequestedBy,
          });
          migratedPairs.add(pairKey);
        }
      }

      await doc.ref.delete();
    }

    const dummyParticipants = await db
      .collection("expense_participants")
      .where("user_id", "==", dummyId)
      .get();

    for (const participantDoc of dummyParticipants.docs) {
      const participant = participantDoc.data();
      const expenseId = String(participant.expense_id);
      const existing = await db
        .collection("expense_participants")
        .where("expense_id", "==", expenseId)
        .where("user_id", "==", newUserId)
        .limit(1)
        .get();

      if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const existingRow = existingDoc.data();
        await existingDoc.ref.set(
          {
            paid_amount: Number(existingRow.paid_amount || 0) + Number(participant.paid_amount || 0),
            owed_amount: Number(existingRow.owed_amount || 0) + Number(participant.owed_amount || 0),
            is_settled: Boolean(existingRow.is_settled) && Boolean(participant.is_settled),
            updated_at: new Date().toISOString(),
            _updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const newId = newAppId();
        await db.collection("expense_participants").doc(newId).set({
          ...participant,
          id: newId,
          user_id: newUserId,
          updated_at: new Date().toISOString(),
          _updated_at: FieldValue.serverTimestamp(),
        });
      }

      await participantDoc.ref.delete();
    }

    await dummyDoc.ref.delete();
    merged += 1;
  }

  return merged;
}

async function processInvite(inviteToken: string, newUserId: string): Promise<{ inviterId: string | null; friendAdded: boolean }> {
  const db = getAdminDb();
  const inviteSnap = await db
    .collection("invitations")
    .where("token", "==", inviteToken)
    .limit(1)
    .get();

  if (inviteSnap.empty) {
    return { inviterId: null, friendAdded: false };
  }

  const inviteDoc = inviteSnap.docs[0];
  const invite = inviteDoc.data();
  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;

  if (invite.status !== "pending" || (expiresAt && expiresAt < new Date())) {
    return { inviterId: null, friendAdded: false };
  }

  const inviterId = String(invite.invited_by || "");
  if (!inviterId) {
    return { inviterId: null, friendAdded: false };
  }

  await inviteDoc.ref.set(
    {
      status: "accepted",
      updated_at: new Date().toISOString(),
      _updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
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

  const db = getAdminDb();
  const inviterDoc = await db.collection("users").doc(inviterId).get();
  if (!inviterDoc.exists) {
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

    const db = getAdminDb();
    const now = new Date().toISOString();

    const userRef = db.collection("users").doc(auth.user.id);
    const existing = await userRef.get();

    const fallbackName = rawName || auth.user.name || "User";
    const fallbackEmail = auth.user.email || "";

    await userRef.set(
      {
        id: auth.user.id,
        email: fallbackEmail,
        email_normalized: normalizeEmail(fallbackEmail),
        name: fallbackName,
        name_normalized: normalizeName(fallbackName),
        role: "user",
        is_active: true,
        is_dummy: false,
        auth_provider: "firebase",
        email_verified: true,
        default_currency: existing.data()?.default_currency || "INR",
        timezone: existing.data()?.timezone || "Asia/Kolkata",
        language: existing.data()?.language || "en",
        push_notifications_enabled: existing.data()?.push_notifications_enabled || false,
        email_notifications_enabled: existing.data()?.email_notifications_enabled !== false,
        created_at: existing.data()?.created_at || now,
        updated_at: now,
        _created_at: existing.exists ? existing.data()?._created_at : FieldValue.serverTimestamp(),
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let inviterId: string | null = null;
    let friendAdded = false;

    if (inviteToken) {
      const inviteResult = await processInvite(inviteToken, auth.user.id);
      inviterId = inviteResult.inviterId;
      friendAdded = inviteResult.friendAdded;
    } else if (inviterRef) {
      const referralResult = await processReferral(inviterRef, auth.user.id);
      inviterId = referralResult.inviterId;
      friendAdded = referralResult.friendAdded;
    }

    let dummyMerged = 0;
    if (inviterId && fallbackName) {
      dummyMerged = await mergeDummyFriends(inviterId, auth.user.id, fallbackName);
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
      { status: existing.exists ? 200 : 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to bootstrap user" },
      { status: 500 }
    );
  }
}

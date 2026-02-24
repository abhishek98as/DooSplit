import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { invitationDocId, normalizeEmail } from "@/lib/social/keys";
import {
  getFriendshipStatus,
  upsertBidirectionalFriendship,
} from "@/lib/social/friendship-store";
import { notifyFriendAccepted, notifyFriendRequest } from "@/lib/notificationService";
import { invalidateUsersCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

type InvitationMode =
  | "invitation_created"
  | "friend_request_created"
  | "already_friends"
  | "already_pending"
  | "auto_accepted_pending";

function toIso(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof (value as any)?.toDate === "function") {
    return (value as any).toDate().toISOString();
  }
  return "";
}

function toMillis(value: unknown): number {
  const iso = toIso(value);
  if (!iso) {
    return 0;
  }
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeInvitation(invitation: any) {
  const id = String(invitation?.id || invitation?._id || "");
  const createdAt = toIso(invitation?.created_at || invitation?.createdAt);
  const updatedAt = toIso(invitation?.updated_at || invitation?.updatedAt);
  const expiresAt = toIso(invitation?.expires_at || invitation?.expiresAt);

  return {
    _id: id,
    id,
    invitedBy: String(invitation?.invited_by || invitation?.invitedBy || ""),
    invited_by: String(invitation?.invited_by || invitation?.invitedBy || ""),
    email: String(invitation?.email || ""),
    token: String(invitation?.token || ""),
    status: String(invitation?.status || "pending"),
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    expiresAt,
    expires_at: expiresAt,
    acceptedAt: toIso(invitation?.accepted_at || invitation?.acceptedAt),
    accepted_at: toIso(invitation?.accepted_at || invitation?.acceptedAt),
  };
}

function modeResponse(
  mode: InvitationMode,
  message: string,
  status = 200,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    {
      mode,
      message,
      ...extra,
    },
    { status }
  );
}

async function findUserByEmailNormalized(
  emailNormalized: string
): Promise<Record<string, any> | null> {
  const db = getAdminDb();
  const [normalizedSnap, legacySnap] = await Promise.all([
    db.collection("users").where("email_normalized", "==", emailNormalized).limit(1).get(),
    db.collection("users").where("email", "==", emailNormalized).limit(1).get(),
  ]);

  const doc = !normalizedSnap.empty
    ? normalizedSnap.docs[0]
    : !legacySnap.empty
    ? legacySnap.docs[0]
    : null;

  if (!doc) {
    return null;
  }

  return {
    id: doc.id,
    ...((doc.data() as any) || {}),
  };
}

async function getLatestInvitationForInviterEmail(invitedBy: string, emailNormalized: string) {
  const db = getAdminDb();
  const deterministicId = invitationDocId(invitedBy, emailNormalized);

  const [deterministicDoc, normalizedSnap, legacySnap] = await Promise.all([
    db.collection("invitations").doc(deterministicId).get(),
    db
      .collection("invitations")
      .where("invited_by", "==", invitedBy)
      .where("email_normalized", "==", emailNormalized)
      .limit(20)
      .get(),
    db
      .collection("invitations")
      .where("invited_by", "==", invitedBy)
      .where("email", "==", emailNormalized)
      .limit(20)
      .get(),
  ]);

  const rows = new Map<string, any>();
  const refs = new Map<string, any>();

  if (deterministicDoc.exists) {
    rows.set(deterministicDoc.id, {
      id: deterministicDoc.id,
      ...(deterministicDoc.data() || {}),
    });
    refs.set(deterministicDoc.id, deterministicDoc.ref);
  }

  for (const doc of [...normalizedSnap.docs, ...legacySnap.docs]) {
    rows.set(doc.id, {
      id: doc.id,
      ...((doc.data() as any) || {}),
    });
    refs.set(doc.id, doc.ref);
  }

  const values = Array.from(rows.values());
  values.sort((left, right) => {
    const leftMs = toMillis(left.updated_at || left.created_at);
    const rightMs = toMillis(right.updated_at || right.created_at);
    return rightMs - leftMs;
  });

  return {
    deterministicId,
    latest: values[0] || null,
    refs,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const db = getAdminDb();
    const invitationsSnap = await db
      .collection("invitations")
      .where("invited_by", "==", auth.user.id)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();

    const invitations = invitationsSnap.docs.map((doc) => ({
      id: doc.id,
      ...((doc.data() as any) || {}),
    }));

    return NextResponse.json(
      { invitations: invitations.map(normalizeInvitation) },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("List invitations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const email = normalizeEmail(body?.email || "");

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const inviterDoc = await db.collection("users").doc(auth.user.id).get();
    if (!inviterDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const inviter = inviterDoc.data() || {};
    if (normalizeEmail(inviter.email || "") === email) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      );
    }

    const existingUser = await findUserByEmailNormalized(email);
    if (existingUser?.id) {
      const existingUserId = String(existingUser.id);
      if (!existingUserId || existingUserId === auth.user.id) {
        return NextResponse.json(
          { error: "You cannot invite yourself" },
          { status: 400 }
        );
      }

      const inviterId = auth.user.id;
      const inviterName = String(inviter.name || auth.user.name || "Someone");
      const friendshipStatus = await getFriendshipStatus(inviterId, existingUserId);

      if (friendshipStatus.status === "accepted") {
        return modeResponse(
          "already_friends",
          "You are already friends with this user.",
          200,
          {
            friend: {
              id: existingUserId,
              name: String(existingUser.name || "Unknown"),
              email: String(existingUser.email || email),
            },
          }
        );
      }

      if (friendshipStatus.status === "pending") {
        const reversePending =
          friendshipStatus.reverse &&
          String(friendshipStatus.reverse.data.status || "") === "pending" &&
          String(friendshipStatus.reverse.data.requested_by || "") === existingUserId;

        if (reversePending) {
          await upsertBidirectionalFriendship({
            userId: inviterId,
            friendId: existingUserId,
            status: "accepted",
            requestedBy: existingUserId,
          });

          try {
            await notifyFriendAccepted(
              { id: inviterId, name: inviterName },
              existingUserId
            );
          } catch (notifError) {
            console.error("Failed to send auto-accept notification:", notifError);
          }

          await invalidateUsersCache(
            [inviterId, existingUserId],
            [
              "friends",
              "activities",
              "dashboard-activity",
              "friend-transactions",
              "friend-details",
              "analytics",
            ]
          );

          return modeResponse(
            "auto_accepted_pending",
            "Pending request already existed. Friendship accepted automatically.",
            200,
            {
              friend: {
                id: existingUserId,
                name: String(existingUser.name || "Unknown"),
                email: String(existingUser.email || email),
              },
            }
          );
        }

        return modeResponse(
          "already_pending",
          "A friend request is already pending for this user.",
          200,
          {
            friend: {
              id: existingUserId,
              name: String(existingUser.name || "Unknown"),
              email: String(existingUser.email || email),
            },
          }
        );
      }

      await upsertBidirectionalFriendship({
        userId: inviterId,
        friendId: existingUserId,
        status: "pending",
        requestedBy: inviterId,
      });

      try {
        await notifyFriendRequest(
          {
            id: inviterId,
            name: inviterName,
          },
          existingUserId
        );
      } catch (notifError) {
        console.error("Failed to send friend request notification:", notifError);
      }

      await invalidateUsersCache(
        [inviterId, existingUserId],
        [
          "friends",
          "activities",
          "dashboard-activity",
          "friend-transactions",
          "friend-details",
          "analytics",
        ]
      );

      return modeResponse(
        "friend_request_created",
        "User is already on DooSplit. Friend request sent successfully.",
        201,
        {
          friend: {
            id: existingUserId,
            name: String(existingUser.name || "Unknown"),
            email: String(existingUser.email || email),
          },
        }
      );
    }

    const { deterministicId, latest, refs } = await getLatestInvitationForInviterEmail(
      auth.user.id,
      email
    );

    if (latest?.id && String(latest.status || "") === "accepted") {
      return NextResponse.json(
        { error: "This invitation has already been accepted." },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const refreshedExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const invitationToken = String(
      latest?.token || crypto.randomBytes(32).toString("hex")
    );

    const createdAt = String(latest?.created_at || nowIso);
    const invitationRef = db.collection("invitations").doc(deterministicId);

    await invitationRef.set(
      {
        id: deterministicId,
        invited_by: auth.user.id,
        email,
        email_normalized: email,
        token: invitationToken,
        status: "pending",
        created_at: createdAt,
        updated_at: nowIso,
        expires_at: refreshedExpiresAt,
        _updated_at: FieldValue.serverTimestamp(),
        ...(latest?.id ? {} : { _created_at: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    const cleanupBatch = db.batch();
    for (const [rowId, ref] of refs.entries()) {
      if (rowId !== deterministicId) {
        cleanupBatch.delete(ref);
      }
    }
    if (refs.size > 1 || (refs.size === 1 && !refs.has(deterministicId))) {
      await cleanupBatch.commit();
    }

    const invitationDoc = await invitationRef.get();
    const invitation = {
      id: invitationDoc.id,
      ...(invitationDoc.data() || {}),
    };

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${invitationToken}`;

    try {
      await sendInviteEmail({
        to: email,
        inviterName: String(inviter.name || "A friend"),
        inviteLink,
      });
    } catch (emailError: any) {
      console.error("Email send error:", emailError);
      return NextResponse.json(
        {
          mode: "invitation_created",
          message:
            "Invitation created but email could not be sent. Share the link manually.",
          invitation: {
            ...normalizeInvitation(invitation),
            inviteLink,
          },
          emailSent: false,
          reinvited: Boolean(latest?.id),
        },
        { status: latest?.id ? 200 : 201 }
      );
    }

    return NextResponse.json(
      {
        mode: "invitation_created",
        message: latest?.id
          ? "Invitation resent successfully!"
          : "Invitation sent successfully!",
        invitation: {
          ...normalizeInvitation(invitation),
          inviteLink,
        },
        emailSent: true,
        reinvited: Boolean(latest?.id),
      },
      { status: latest?.id ? 200 : 201 }
    );
  } catch (error: any) {
    console.error("Send invitation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send invitation" },
      { status: 500 }
    );
  }
}


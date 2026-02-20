import { NextRequest, NextResponse } from "next/server";
import { sendInviteEmail } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { invitationDocId, normalizeEmail } from "@/lib/social/keys";

export const dynamic = "force-dynamic";

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

async function resolveInvitationByAnyId(invitationId: string): Promise<{
  id: string;
  data: Record<string, any>;
} | null> {
  const db = getAdminDb();
  const directDoc = await db.collection("invitations").doc(invitationId).get();
  if (directDoc.exists) {
    return {
      id: directDoc.id,
      data: {
        id: directDoc.id,
        ...(directDoc.data() || {}),
      },
    };
  }

  const fallbackSnap = await db
    .collection("invitations")
    .where("id", "==", invitationId)
    .limit(1)
    .get();
  if (fallbackSnap.empty) {
    return null;
  }

  const doc = fallbackSnap.docs[0];
  return {
    id: doc.id,
    data: {
      id: doc.id,
      ...(doc.data() || {}),
    },
  };
}

async function findUserByEmailNormalized(emailNormalized: string) {
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
    ...(doc.data() || {}),
  };
}

async function writeCanonicalInvitation(
  rowId: string,
  rowData: Record<string, any>,
  patch: Record<string, unknown>
): Promise<Record<string, any>> {
  const db = getAdminDb();
  const invitedBy = String(rowData.invited_by || "");
  const emailNormalized = normalizeEmail(rowData.email_normalized || rowData.email || "");
  const targetId =
    invitedBy && emailNormalized ? invitationDocId(invitedBy, emailNormalized) : rowId;
  const nowIso = new Date().toISOString();

  const nextData = {
    ...rowData,
    ...patch,
    id: targetId,
    email: String(rowData.email || emailNormalized),
    email_normalized: emailNormalized,
    updated_at: nowIso,
    _updated_at: FieldValue.serverTimestamp(),
  };

  const targetRef = db.collection("invitations").doc(targetId);
  await targetRef.set(nextData, { merge: true });

  if (rowId !== targetId) {
    await db.collection("invitations").doc(rowId).delete();
  }

  const updatedDoc = await targetRef.get();
  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() || {}),
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const { action } = body || {};
    if (action !== "resend") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const resolved = await resolveInvitationByAnyId(id);
    if (!resolved) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const invitation = resolved.data;
    if (String(invitation.invited_by || "") !== auth.user.id) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 400 }
      );
    }
    if (invitation.status === "cancelled") {
      return NextResponse.json(
        { error: "This invitation has been cancelled" },
        { status: 400 }
      );
    }

    const emailNormalized = normalizeEmail(
      invitation.email_normalized || invitation.email || ""
    );
    const existingUser = await findUserByEmailNormalized(emailNormalized);
    if (existingUser?.id) {
      await writeCanonicalInvitation(resolved.id, invitation, {
        status: "accepted",
      });
      return NextResponse.json(
        { error: "This user has already registered" },
        { status: 400 }
      );
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const updatedInvitation = await writeCanonicalInvitation(resolved.id, invitation, {
      status: "pending",
      expires_at: newExpiresAt,
    });

    const db = getAdminDb();
    const inviterDoc = await db.collection("users").doc(auth.user.id).get();
    const inviterName = String(inviterDoc.data()?.name || "A friend");

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const inviteLink = `${appUrl}/invite/${String(updatedInvitation.token || "")}`;

    try {
      await sendInviteEmail({
        to: emailNormalized,
        inviterName,
        inviteLink,
      });

      return NextResponse.json(
        {
          message: "Invitation resent successfully!",
          invitation: normalizeInvitation(updatedInvitation),
          emailSent: true,
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("Email send error:", emailError);
      return NextResponse.json(
        {
          message: "Invitation updated but email could not be sent",
          invitation: normalizeInvitation(updatedInvitation),
          emailSent: false,
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error("Resend invitation error:", error);
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const resolved = await resolveInvitationByAnyId(id);
    if (!resolved) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const invitation = resolved.data;
    if (String(invitation.invited_by || "") !== auth.user.id) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cannot cancel an accepted invitation" },
        { status: 400 }
      );
    }

    const cancelledInvitation = await writeCanonicalInvitation(resolved.id, invitation, {
      status: "cancelled",
    });

    return NextResponse.json(
      {
        message: "Invitation cancelled successfully",
        invitation: normalizeInvitation(cancelledInvitation),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Cancel invitation error:", error);
    return NextResponse.json(
      { error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}

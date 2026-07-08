import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { newAppId } from "@/lib/ids";
import { fetchDocsByIds, mapUser, toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { invalidateUsersCache } from "@/lib/cache";
import { EXPENSE_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logActivity } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";

function parseMentionedUsernames(commentText: string): string[] {
  if (!commentText) {
    return [];
  }

  const matches = commentText.match(/@([a-zA-Z0-9._-]{2,50})/g) || [];
  return Array.from(new Set(matches.map((token) => token.slice(1).toLowerCase())));
}

async function getExpenseRow(expenseId: string) {
  const db = getAdminDb();
  const doc = await db.collection(COLLECTIONS.expenses).doc(expenseId).get();
  if (!doc.exists) {
    return null;
  }
  const row: any = { id: doc.id, ...((doc.data() as any) || {}) };
  if (row.is_deleted) {
    return null;
  }
  return row;
}

async function getExpenseParticipants(expenseId: string): Promise<any[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.expenseParticipants)
    .where("expense_id", "==", expenseId)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));
}

async function isExpenseParticipant(expenseId: string, userId: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.expenseParticipants)
    .where("expense_id", "==", expenseId)
    .where("user_id", "==", userId)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const participant = await isExpenseParticipant(id, userId);
    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getAdminDb();
    const commentsSnap = await db
      .collection(COLLECTIONS.expenseComments)
      .where("expense_id", "==", id)
      .orderBy("created_at", "desc")
      .limit(200)
      .get();

    const comments = commentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    }));

    const userIds = uniqueStrings(comments.map((comment: any) => String(comment.created_by || "")));
    const usersMap = await fetchDocsByIds(COLLECTIONS.users, userIds);

    const payload = comments.map((comment: any) => ({
      _id: String(comment.id || ""),
      expenseId: String(comment.expense_id || ""),
      message: String(comment.message || ""),
      mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
      createdBy: mapUser(usersMap.get(String(comment.created_by || ""))),
      createdAt: toIso(comment.created_at || comment._created_at),
      updatedAt: toIso(comment.updated_at || comment._updated_at),
    }));

    return NextResponse.json({ comments: payload }, { status: 200 });
  } catch (error) {
    console.error("Get expense comments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const participant = await isExpenseParticipant(id, userId);
    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const expense = await getExpenseRow(id);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const body = await request.json();
    const rawMessage = String(body?.message || "").trim();
    if (!rawMessage) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }
    if (rawMessage.length > 1000) {
      return NextResponse.json(
        { error: "Comment cannot exceed 1000 characters" },
        { status: 400 }
      );
    }

    const participants = await getExpenseParticipants(id);
    const participantIds = uniqueStrings(participants.map((p: any) => String(p.user_id || "")));
    const participantUsersMap = await fetchDocsByIds(COLLECTIONS.users, participantIds);

    const mentionedTokens = parseMentionedUsernames(rawMessage);
    const mentions = participantIds
      .map((participantId) => {
        const user = participantUsersMap.get(participantId);
        if (!user) {
          return null;
        }
        const normalizedName = String(user.name || "").trim().toLowerCase().replace(/\s+/g, "");
        const normalizedEmailPrefix = String(user.email || "")
          .split("@")[0]
          .trim()
          .toLowerCase();
        const matched = mentionedTokens.some((token) => {
          const normalizedToken = token.replace(/\s+/g, "");
          return (
            normalizedToken === normalizedName ||
            normalizedToken === normalizedEmailPrefix ||
            normalizedToken === String(participantId).toLowerCase()
          );
        });
        return matched ? participantId : null;
      })
      .filter(Boolean) as string[];

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    const commentId = newAppId();

    await db.collection(COLLECTIONS.expenseComments).doc(commentId).set({
      id: commentId,
      expense_id: id,
      message: rawMessage,
      mentions,
      created_by: userId,
      created_at: nowIso,
      updated_at: nowIso,
      _created_at: FieldValue.serverTimestamp(),
      _updated_at: FieldValue.serverTimestamp(),
    });

    const actorName = auth.user.name || "Someone";
    const affectedUserIds = uniqueStrings([userId, ...participantIds]);

    void logActivity({
      userIds: affectedUserIds,
      actorId: userId,
      actorName,
      type: "expense_comment_added",
      title: "Expense Comment Added",
      description: `${actorName} commented on "${String(expense.description || "Expense")}"`,
      metadata: {
        expenseId: id,
        expenseDescription: String(expense.description || "Expense"),
        commentId,
        commentPreview: rawMessage.slice(0, 120),
        mentions,
      },
    });

    if (mentions.length > 0) {
      void logActivity({
        userIds: mentions,
        actorId: userId,
        actorName,
        type: "expense_mentioned",
        title: "Mentioned in Expense",
        description: `${actorName} mentioned you on "${String(expense.description || "Expense")}"`,
        metadata: {
          expenseId: id,
          expenseDescription: String(expense.description || "Expense"),
          commentId,
          commentPreview: rawMessage.slice(0, 120),
        },
      });

      const mentionNotificationTargets = mentions.filter((mentionedId) => mentionedId !== userId);
      if (mentionNotificationTargets.length > 0) {
        const notificationBatch = db.batch();
      for (const mentionedUserId of mentionNotificationTargets) {
        const notificationRef = db.collection(COLLECTIONS.notifications).doc(newAppId());
        notificationBatch.set(notificationRef, {
          id: notificationRef.id,
          user_id: mentionedUserId,
          type: "expense_mentioned",
          message: `${actorName} mentioned you on "${String(expense.description || "Expense")}"`,
          data: {
            expenseId: id,
            commentId,
          },
          is_read: false,
          created_at: nowIso,
          updated_at: nowIso,
          _created_at: FieldValue.serverTimestamp(),
          _updated_at: FieldValue.serverTimestamp(),
        });
      }
      await notificationBatch.commit();
      }
    }

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      {
        success: true,
        comment: {
          _id: commentId,
          expenseId: id,
          message: rawMessage,
          mentions,
          createdBy: {
            _id: userId,
            name: actorName,
            email: auth.user.email || "",
            profilePicture:
              (auth.user as { image?: string | null }).image ?? null,
          },
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create expense comment error:", error);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    );
  }
}

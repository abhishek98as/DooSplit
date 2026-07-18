import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId } from "@/lib/ids";
import { invalidateUsersCache } from "@/lib/cache";
import { EXPENSE_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logActivity } from "@/lib/activity-logger";
import {
  getExpenseById,
  listExpenseParticipants,
  listExpenseComments,
  putExpenseComment,
} from "@/lib/dynamodb/entities/expenses";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import { putNotification } from "@/lib/dynamodb/entities/notifications";

export const dynamic = "force-dynamic";

function parseMentionedUsernames(commentText: string): string[] {
  if (!commentText) {
    return [];
  }
  const matches = commentText.match(/@([a-zA-Z0-9._-]{2,50})/g) || [];
  return Array.from(new Set(matches.map((token) => token.slice(1).toLowerCase())));
}

function mapUserLocal(user: any) {
  if (!user) return null;
  return {
    _id: String(user.id || user._id || ""),
    name: String(user.name || ""),
    email: String(user.email || ""),
    photoUrl: user.photo_url || user.photoUrl || null,
  };
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

    // Check if user is a participant in DynamoDB
    const participants = await listExpenseParticipants(id);
    const isParticipant = participants.some((p) => p.user_id === userId);
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const commentRows = await listExpenseComments(id);
    // Sort comments descending by creation date (newest first) as expected by the frontend
    commentRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const userIds = Array.from(new Set(commentRows.map((c) => String(c.user_id || ""))));
    const users = await getUsersByIds(userIds);
    const usersMap = new Map(users.map((u) => [u.id, u]));

    const payload = commentRows.map((comment) => ({
      _id: String(comment.id || ""),
      expenseId: String(comment.expense_id || ""),
      message: String(comment.content || ""),
      mentions: [],
      createdBy: mapUserLocal(usersMap.get(String(comment.user_id || ""))),
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
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

    const participants = await listExpenseParticipants(id);
    const isParticipant = participants.some((p) => p.user_id === userId);
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const expense = await getExpenseById(id);
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

    const participantIds = Array.from(new Set(participants.map((p) => String(p.user_id || ""))));
    const participantUsers = await getUsersByIds(participantIds);
    const participantUsersMap = new Map(participantUsers.map((u) => [u.id, u]));

    const mentionedTokens = parseMentionedUsernames(rawMessage);
    const mentions = participantIds
      .map((pId) => {
        const user = participantUsersMap.get(pId);
        if (!user) return null;
        const normalizedName = String(user.name || "").trim().toLowerCase().replace(/\s+/g, "");
        const normalizedEmailPrefix = String(user.email || "").split("@")[0].trim().toLowerCase();
        const matched = mentionedTokens.some((token) => {
          const normalizedToken = token.replace(/\s+/g, "");
          return (
            normalizedToken === normalizedName ||
            normalizedToken === normalizedEmailPrefix ||
            normalizedToken === String(pId).toLowerCase()
          );
        });
        return matched ? pId : null;
      })
      .filter(Boolean) as string[];

    const nowIso = new Date().toISOString();
    const commentId = newAppId();

    await putExpenseComment({
      id: commentId,
      expense_id: id,
      content: rawMessage,
      user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const actorName = auth.user.name || "Someone";
    const affectedUserIds = Array.from(new Set([userId, ...participantIds]));

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

      const mentionNotificationTargets = mentions.filter((mId) => mId !== userId);
      if (mentionNotificationTargets.length > 0) {
        await Promise.all(
          mentionNotificationTargets.map((mentionedUserId) =>
            putNotification({
              id: newAppId(),
              user_id: mentionedUserId,
              type: "expense_mentioned",
              title: "Mentioned in Expense",
              message: `${actorName} mentioned you on "${String(expense.description || "Expense")}"`,
              is_read: false,
              created_at: nowIso,
            })
          )
        );
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
            photoUrl: (auth.user as { image?: string | null }).image ?? null,
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

import { NextRequest, NextResponse } from "next/server";
import { resolvePaidAmounts, validateSplit } from "@/lib/splitCalculator";
import { buildSplitParticipants } from "@/lib/expenses/expense-creation";
import { notifyExpenseDeleted, notifyExpenseUpdated } from "@/lib/notificationService";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { EXPENSE_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logActivity, logExpenseDeleted, logExpenseUpdated } from "@/lib/activity-logger";
import {
  getPaymentStatusLabel,
  isPaymentStatus,
  normalizePaymentStatus,
} from "@/lib/expenses/payment-status";
import { newAppId } from "@/lib/ids";
import {
  getExpenseById,
  listExpenseParticipants,
  listExpenseComments,
} from "@/lib/dynamodb/entities/expenses";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import { getGroupById } from "@/lib/dynamodb/entities/groups";
import {
  updateExpenseInDynamo,
  updateExpensePaymentStatusInDynamo,
  deleteExpenseInDynamo,
} from "@/lib/dynamodb/write-operations";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

function toStringId(value: any): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : value.toString();
}

function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
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

function mapGroupLocal(group: any) {
  if (!group) return null;
  return {
    _id: String(group.id || group._id || ""),
    name: String(group.name || ""),
    image: group.image || null,
  };
}

async function buildExpenseResponse(expenseId: string) {
  const expense = await getExpenseById(expenseId);
  if (!expense || expense.is_deleted) {
    throw new Error("Expense not found");
  }

  const participants = await listExpenseParticipants(expenseId);
  const commentsRows = await listExpenseComments(expenseId);

  const commentUserIds = uniqueStrings(commentsRows.map((c) => String(c.user_id || "")));
  const participantUserIds = uniqueStrings(participants.map((p) => String(p.user_id || "")));

  const allUserIds = uniqueStrings([
    String(expense.created_by || ""),
    ...participantUserIds,
    ...commentUserIds,
  ]);
  const users = await getUsersByIds(allUserIds);
  const usersMap = new Map(users.map((u) => [u.id, u]));

  const comments = commentsRows.map((comment) => ({
    _id: String(comment.id || ""),
    expenseId: String(comment.expense_id || ""),
    message: String(comment.content || ""),
    mentions: [],
    createdBy: mapUserLocal(usersMap.get(String(comment.user_id || ""))),
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  }));

  const editHistoryRaw = Array.isArray(expense.edit_history) ? expense.edit_history : [];
  const editHistory = editHistoryRaw.map((entry: any, index: number) => ({
    _id: String(entry.id || `${expenseId}_edit_${index}`),
    type: "edit_note",
    message: String(entry.changes || "Updated"),
    createdBy: mapUserLocal(usersMap.get(String(entry.editedBy || ""))),
    createdAt: entry.editedAt,
    metadata: {
      editedBy: String(entry.editedBy || ""),
      diff: entry.diff || null,
    },
  }));

  const discussionThread = [
    ...comments.map((comment) => ({
      _id: comment._id,
      type: "comment" as const,
      message: comment.message,
      mentions: comment.mentions,
      createdBy: comment.createdBy,
      createdAt: comment.createdAt,
    })),
    ...editHistory.map((entry: any) => ({
      _id: entry._id,
      type: entry.type as "edit_note",
      message: entry.message,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt,
      metadata: entry.metadata,
    })),
  ].sort((a: any, b: any) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  let group: any = null;
  if (expense.group_id) {
    const groupRow = await getGroupById(expense.group_id);
    if (groupRow) {
      group = mapGroupLocal(groupRow);
    }
  }

  const mappedParticipants = participants.map((participant) => {
    const user = usersMap.get(String(participant.user_id || ""));
    return {
      _id: String(participant.user_id || ""),
      expenseId: String(participant.expense_id || ""),
      userId: user ? mapUserLocal(user) : null,
      paidAmount: toNum(participant.amount_paid),
      owedAmount: toNum(participant.amount_owed),
      isSettled: Boolean(participant.is_settled),
      createdAt: participant.created_at,
      updatedAt: participant.updated_at,
    };
  });

  const createdAt = expense.created_at;
  const updatedAt = expense.updated_at;
  const paymentStatus = normalizePaymentStatus(expense.payment_status, "unpaid");
  const versionVector = {
    version: 1,
    lastModified: updatedAt || createdAt,
    modifiedBy: String(expense.created_by || ""),
  };

  return {
    expense: {
      _id: String(expense.id || ""),
      amount: toNum(expense.amount),
      description: String(expense.description || ""),
      category: String(expense.category || "other"),
      date: expense.date || createdAt,
      currency: String(expense.currency || "INR"),
      createdBy: mapUserLocal(usersMap.get(String(expense.created_by || ""))),
      groupId: group,
      images: Array.isArray(expense.receipt_images) ? expense.receipt_images : [],
      notes: expense.notes || "",
      paymentStatus,
      recurringTemplateId: expense.recurring_template_id || undefined,
      recurringRunId: expense.recurring_run_id || undefined,
      recurrenceOccurrenceDate: expense.recurrence_occurrence_date || undefined,
      isDeleted: Boolean(expense.is_deleted),
      editHistory,
      comments,
      discussionThread,
      createdAt,
      updatedAt,
      participants: mappedParticipants,
      _version: versionVector,
    },
    etag: `"${expense.id}-1"`,
    versionVector,
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

    // Check if participant in DynamoDB
    const participants = await listExpenseParticipants(id);
    const isParticipant = participants.some((p) => p.user_id === userId);
    if (!isParticipant) {
      const expense = await getExpenseById(id);
      // Let creator read their own expense
      if (!expense || expense.created_by !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const cacheKey = buildUserScopedCacheKey("expenses", userId, `detail:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.expenses, async () =>
      buildExpenseResponse(id)
    );

    return NextResponse.json(
      { expense: payload.expense },
      {
        status: 200,
        headers: {
          ETag: payload.etag,
          "X-Version-Vector": JSON.stringify(payload.versionVector),
        },
      }
    );
  } catch (error: any) {
    if (error.message === "Expense not found") {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    console.error("Get expense error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense" },
      { status: 500 }
    );
  }
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
    const currentUserId = auth.user.id;

    const body = await request.json();
    const {
      amount,
      description,
      category,
      date,
      currency,
      groupId,
      images,
      notes,
      splitMethod,
      paidBy,
      payers,
      participants,
      paymentStatus,
    } = body || {};

    const expense = await getExpenseById(id);
    if (!expense || expense.is_deleted) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const previousParticipants = await listExpenseParticipants(id);
    const isParticipant = previousParticipants.some((p) => p.user_id === currentUserId);
    if (!isParticipant && expense.created_by !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (String(expense.created_by || "") !== currentUserId) {
      return NextResponse.json(
        { error: "Only expense creator can edit" },
        { status: 403 }
      );
    }

    if (images !== undefined && Array.isArray(images)) {
      if (images.length > 10) {
        return NextResponse.json(
          { error: "Maximum 10 images allowed per expense" },
          { status: 400 }
        );
      }
      const invalid = images.filter((img: any) => typeof img !== "string" || !img.trim());
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "All image references must be valid strings" },
          { status: 400 }
        );
      }
    }

    const nowIso = new Date().toISOString();
    const changes: string[] = [];
    const diff: Record<string, { before: any; after: any }> = {};

    if (amount !== undefined && Number(amount) !== toNum(expense.amount)) {
      changes.push(`amount: ${toNum(expense.amount)} -> ${Number(amount)}`);
      diff.amount = { before: toNum(expense.amount), after: Number(amount) };
    }
    if (description !== undefined && String(description) !== String(expense.description)) {
      changes.push("description updated");
      diff.description = {
        before: String(expense.description || ""),
        after: String(description),
      };
    }
    if (category !== undefined && String(category) !== String(expense.category)) {
      changes.push(`category: ${expense.category} -> ${category}`);
      diff.category = {
        before: String(expense.category || "other"),
        after: String(category),
      };
    }
    if (date !== undefined) {
      const previousDate = new Date(expense.date || expense.created_at).toISOString();
      const nextDate = new Date(date).toISOString();
      if (previousDate !== nextDate) {
        diff.date = { before: previousDate, after: nextDate };
        changes.push("date updated");
      }
    }
    if (currency !== undefined && String(currency) !== String(expense.currency || "INR")) {
      changes.push(`currency: ${String(expense.currency || "INR")} -> ${String(currency)}`);
      diff.currency = {
        before: String(expense.currency || "INR"),
        after: String(currency),
      };
    }
    if (groupId !== undefined && String(groupId || "") !== String(expense.group_id || "")) {
      changes.push("group updated");
      diff.groupId = {
        before: String(expense.group_id || ""),
        after: String(groupId || ""),
      };
    }
    if (notes !== undefined && String(notes || "") !== String(expense.notes || "")) {
      changes.push("notes updated");
      diff.notes = {
        before: String(expense.notes || ""),
        after: String(notes || ""),
      };
    }
    if (images !== undefined) {
      const previousImages = Array.isArray(expense.receipt_images) ? expense.receipt_images : [];
      const nextImages = Array.isArray(images) ? images : [];
      if (JSON.stringify(previousImages) !== JSON.stringify(nextImages)) {
        changes.push("attachments updated");
        diff.images = { before: previousImages, after: nextImages };
      }
    }
    if (
      paymentStatus !== undefined &&
      isPaymentStatus(paymentStatus) &&
      paymentStatus !== normalizePaymentStatus(expense.payment_status, "unpaid")
    ) {
      changes.push(
        `payment status: ${normalizePaymentStatus(expense.payment_status, "unpaid")} -> ${paymentStatus}`
      );
      diff.paymentStatus = {
        before: normalizePaymentStatus(expense.payment_status, "unpaid"),
        after: paymentStatus,
      };
    }

    if (splitMethod && participants) {
      diff.splitMethod = {
        before: String(expense.split_type || "equally"),
        after: String(splitMethod),
      };
      diff.participants = {
        before: previousParticipants.map((participant: any) => ({
          userId: String(participant.user_id || ""),
          paidAmount: Number(participant.amount_paid || 0),
          owedAmount: Number(participant.amount_owed || 0),
        })),
        after: participants.map((participant: any) => ({
          userId: toStringId(participant.userId || participant),
          paidAmount: Number(participant.paidAmount || 0),
          owedAmount: Number(participant.owedAmount || participant.exactAmount || 0),
        })),
      };
    }

    const editHistory = Array.isArray(expense.edit_history) ? [...expense.edit_history] : [];
    if (changes.length > 0) {
      editHistory.push({
        id: newAppId(),
        editedAt: nowIso,
        editedBy: currentUserId,
        changes: changes.join(", "),
        diff,
      });
    }

    const finalAmount = amount !== undefined ? Number(amount) : toNum(expense.amount);
    let splitParticipants: any[] = [];

    const paidByInput =
      Array.isArray(payers) && payers.length > 0
        ? payers
            .map((p: any) => ({
              userId: toStringId(p?.userId ?? p?.id ?? p),
              amount: Number(p?.amount || 0),
            }))
            .filter((p: any) => Boolean(p.userId))
        : toStringId(paidBy) || currentUserId;

    if (Array.isArray(paidByInput)) {
      const payerTotal = paidByInput.reduce(
        (sum: number, p: { amount: number }) => sum + Number(p.amount || 0),
        0
      );
      if (Math.abs(payerTotal - finalAmount) > 0.01) {
        return NextResponse.json(
          { error: `Payer amounts (${payerTotal}) must equal expense amount (${finalAmount})` },
          { status: 400 }
        );
      }
    }

    if (splitMethod && participants) {
      try {
        splitParticipants = buildSplitParticipants(
          {
            amount: finalAmount,
            participants,
            splitMethod,
            paidBy: Array.isArray(paidByInput) ? undefined : paidByInput,
            payers: Array.isArray(paidByInput) ? paidByInput : undefined,
          },
          currentUserId
        );
      } catch (splitErr: any) {
        return NextResponse.json(
          { error: splitErr?.message || "Invalid split method" },
          { status: 400 }
        );
      }

      if (!validateSplit(splitParticipants, finalAmount)) {
        return NextResponse.json({ error: "Invalid split calculation" }, { status: 400 });
      }
    } else {
      // Keep existing owed shares; update paid amounts from payers / paidBy
      const paidMap = resolvePaidAmounts(finalAmount, paidByInput);
      const owedRows = previousParticipants.map((p) => ({
        userId: p.user_id,
        owedAmount: Number(p.amount_owed || 0),
      }));
      for (const payerId of paidMap.keys()) {
        if (!owedRows.some((r) => r.userId === payerId)) {
          owedRows.push({ userId: payerId, owedAmount: 0 });
        }
      }
      splitParticipants = owedRows.map((row) => ({
        userId: row.userId,
        owedAmount: row.owedAmount,
        paidAmount: paidMap.get(row.userId) || 0,
      }));
    }

    const newExpenseMeta = {
      id: expense.id,
      amount: finalAmount,
      description: description !== undefined ? String(description) : expense.description,
      category: category !== undefined ? String(category) : expense.category || "other",
      date: date !== undefined ? new Date(date).toISOString() : expense.date,
      currency: currency !== undefined ? String(currency) : expense.currency || "INR",
      created_by: expense.created_by,
      group_id: groupId !== undefined ? (groupId ? String(groupId) : undefined) : expense.group_id,
      notes: notes !== undefined ? String(notes) : expense.notes || "",
      split_type: splitMethod || expense.split_type || "equally",
      is_deleted: false,
      is_settled: paymentStatus === "settled" ? true : paymentStatus === "unpaid" ? false : expense.is_settled,
      payment_status: paymentStatus !== undefined ? paymentStatus : expense.payment_status || "unpaid",
      payment_status_updated_at: paymentStatus !== undefined ? nowIso : expense.payment_status_updated_at || expense.created_at,
      payment_status_updated_by: paymentStatus !== undefined ? currentUserId : expense.payment_status_updated_by || expense.created_by,
      receipt_images: images !== undefined ? (Array.isArray(images) ? images : []) : expense.receipt_images || [],
      edit_history: editHistory,
      created_at: expense.created_at,
      updated_at: nowIso,
    };

    const newParticipants = splitParticipants.map((p) => ({
      expense_id: id,
      user_id: p.userId,
      amount_owed: p.owedAmount,
      amount_paid: p.paidAmount,
      is_excluded: false,
      is_settled: newExpenseMeta.is_settled,
      expense_date: newExpenseMeta.date,
      expense_group_id: newExpenseMeta.group_id,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    await updateExpenseInDynamo({
      expenseId: id,
      expense: newExpenseMeta,
      participants: newParticipants,
      oldParticipantUserIds: previousParticipants.map((p) => p.user_id),
      oldDate: expense.date || expense.created_at,
      oldGroupId: expense.group_id || null,
    });

    const responsePayload = await buildExpenseResponse(id);
    const participantIds = responsePayload.expense.participants
      .map((p: any) => p.userId?._id)
      .filter(Boolean);

    let updaterName = auth.user.name || "Someone";
    try {
      const users = await getUsersByIds([currentUserId]);
      if (users[0]) updaterName = users[0].name;

      await notifyExpenseUpdated(
        responsePayload.expense._id,
        responsePayload.expense.description,
        { id: currentUserId, name: updaterName },
        participantIds
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    void logExpenseUpdated({
      actorId: currentUserId,
      actorName: updaterName,
      expenseId: id,
      description: String(responsePayload.expense.description || "Expense"),
      amount: Number(responsePayload.expense.amount || 0),
      currency: String(responsePayload.expense.currency || "INR"),
      participantIds: participantIds.map((p: any) => String(p)),
      diff,
    });

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...previousParticipants.map((p) => p.user_id),
      ...participantIds.map((p: any) => String(p)),
    ]);

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    return NextResponse.json(
      {
        message: "Expense updated successfully",
        expense: responsePayload.expense,
      },
      {
        status: 200,
        headers: {
          ETag: responsePayload.etag,
          "X-Version-Vector": JSON.stringify(responsePayload.versionVector),
        },
      }
    );
  } catch (error: any) {
    console.error("Update expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update expense" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;

    const body = await request.json();
    const nextStatus = body?.paymentStatus;
    if (!isPaymentStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid payment status" }, { status: 400 });
    }

    const expense = await getExpenseById(id);
    if (!expense || expense.is_deleted) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const participants = await listExpenseParticipants(id);
    const isParticipant = participants.some((p) => p.user_id === currentUserId);
    if (!isParticipant && expense.created_by !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const previousStatus = normalizePaymentStatus(expense.payment_status, "unpaid");
    if (previousStatus === nextStatus) {
      const payload = await buildExpenseResponse(id);
      return NextResponse.json(
        { message: "Payment status unchanged", expense: payload.expense },
        {
          status: 200,
          headers: { ETag: payload.etag },
        }
      );
    }

    const nowIso = new Date().toISOString();
    const editHistory = Array.isArray(expense.edit_history) ? [...expense.edit_history] : [];
    editHistory.push({
      id: newAppId(),
      editedAt: nowIso,
      editedBy: currentUserId,
      changes: `payment status: ${previousStatus} -> ${nextStatus}`,
      diff: {
        paymentStatus: { before: previousStatus, after: nextStatus },
      },
    });

    // Save payment status update using new DynamoDB atomic write helper
    await updateExpensePaymentStatusInDynamo(id, nextStatus, currentUserId, nowIso);

    // Update edit history separately on meta record
    const { updateExpense } = await import("@/lib/dynamodb/entities/expenses");
    await updateExpense(id, { edit_history: editHistory, updated_at: nowIso });

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...participants.map((p) => p.user_id),
    ]);

    let actorName = auth.user.name || "Someone";
    try {
      const users = await getUsersByIds([currentUserId]);
      if (users[0]) actorName = users[0].name;
    } catch {}

    void logActivity({
      userIds: affectedUserIds,
      actorId: currentUserId,
      actorName,
      type: "expense_updated",
      title: "Payment Status Updated",
      description: `${actorName} marked "${String(expense.description || "Expense")}" as ${getPaymentStatusLabel(nextStatus)}`,
      metadata: {
        expenseId: id,
        expenseDescription: String(expense.description || "Expense"),
        previousPaymentStatus: previousStatus,
        paymentStatus: nextStatus,
      },
    });

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    const payload = await buildExpenseResponse(id);
    return NextResponse.json(
      {
        message: "Payment status updated successfully",
        expense: payload.expense,
      },
      {
        status: 200,
        headers: { ETag: payload.etag },
      }
    );
  } catch (error: any) {
    console.error("Update payment status error:", error);
    return NextResponse.json({ error: "Failed to update payment status" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;
    const currentUserId = auth.user.id;

    const expense = await getExpenseById(id);
    if (!expense || expense.is_deleted) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const participants = await listExpenseParticipants(id);
    const isParticipant = participants.some((p) => p.user_id === currentUserId);
    if (!isParticipant && expense.created_by !== currentUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const nowIso = new Date().toISOString();

    // Mark as deleted in DynamoDB and feeds
    await deleteExpenseInDynamo(id, nowIso);

    const participantUserIds = participants.map((p) => p.user_id).filter(Boolean);
    const affectedUserIds = uniqueStrings([currentUserId, ...participantUserIds]);

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    let actorName = auth.user.name || "Someone";
    try {
      const users = await getUsersByIds([currentUserId]);
      if (users[0]) actorName = users[0].name;

      await notifyExpenseDeleted(
        expense.description || "Untitled",
        { id: currentUserId, name: actorName },
        participantUserIds
      );
    } catch {}

    void logExpenseDeleted({
      actorId: currentUserId,
      actorName,
      expenseId: id,
      description: expense.description || "Untitled",
      amount: expense.amount || 0,
      currency: expense.currency || "INR",
      participantIds: participantUserIds,
    });

    return NextResponse.json({ message: "Expense deleted" }, { status: 200 });
  } catch (error: any) {
    console.error("Delete expense error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}

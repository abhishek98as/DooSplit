import { NextRequest, NextResponse } from "next/server";
import {
  splitEqually,
  splitByExactAmounts,
  splitByPercentages,
  splitByShares,
  validateSplit,
} from "@/lib/splitCalculator";
import { notifyExpenseDeleted, notifyExpenseUpdated } from "@/lib/notificationService";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { EXPENSE_MUTATION_CACHE_SCOPES } from "@/lib/cache-scopes";
import { logActivity, logExpenseDeleted, logExpenseUpdated } from "@/lib/activity-logger";
import {
  getPaymentStatusLabel,
  isPaymentStatus,
  normalizePaymentStatus,
} from "@/lib/expenses/payment-status";
import {
  fetchDocsByIds,
  logSlowRoute,
  mapGroup,
  mapUser,
  toIso,
  toNum,
  uniqueStrings,
} from "@/lib/firestore/route-helpers";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

function toStringId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

async function getExpenseRow(expenseId: string) {
  const db = getAdminDb();
  const doc = await db.collection("expenses").doc(expenseId).get();
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
    .collection("expense_participants")
    .where("expense_id", "==", expenseId)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));
}

async function isExpenseParticipant(expenseId: string, userId: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db
    .collection("expense_participants")
    .where("expense_id", "==", expenseId)
    .where("user_id", "==", userId)
    .limit(1)
    .get();
  return !snap.empty;
}

async function buildExpenseResponse(expenseId: string) {
  const expense = await getExpenseRow(expenseId);
  if (!expense) {
    throw new Error("Expense not found");
  }

  const participants = await getExpenseParticipants(expenseId);
  const userIds = uniqueStrings([
    String(expense.created_by || ""),
    ...participants.map((participant: any) => String(participant.user_id || "")),
  ]);
  const usersMap = await fetchDocsByIds("users", userIds);

  const db = getAdminDb();
  const commentsSnap = await db
    .collection("expense_comments")
    .where("expense_id", "==", expenseId)
    .orderBy("created_at", "desc")
    .limit(200)
    .get();

  const commentRows = commentsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));

  const commentUserIds = uniqueStrings(
    commentRows.map((comment: any) => String(comment.created_by || ""))
  );
  const commentUsersMap = await fetchDocsByIds("users", commentUserIds);

  const comments = commentRows.map((comment: any) => ({
    _id: String(comment.id || ""),
    expenseId: String(comment.expense_id || ""),
    message: String(comment.message || ""),
    mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
    createdBy: mapUser(commentUsersMap.get(String(comment.created_by || ""))),
    createdAt: toIso(comment.created_at || comment._created_at),
    updatedAt: toIso(comment.updated_at || comment._updated_at),
  }));

  const editHistoryRaw = Array.isArray(expense.edit_history) ? expense.edit_history : [];
  const editHistory = editHistoryRaw.map((entry: any, index: number) => ({
    _id: String(entry.id || `${expenseId}_edit_${index}`),
    type: "edit_note",
    message: String(entry.changes || "Updated"),
    createdBy: mapUser(usersMap.get(String(entry.editedBy || ""))),
    createdAt: toIso(entry.editedAt),
    metadata: {
      editedBy: String(entry.editedBy || ""),
      diff: entry.diff || null,
    },
  }));

  const discussionThread = [...comments.map((comment) => ({
    _id: comment._id,
    type: "comment",
    message: comment.message,
    mentions: comment.mentions,
    createdBy: comment.createdBy,
    createdAt: comment.createdAt,
  })), ...editHistory.map((entry: any) => ({
    _id: entry._id,
    type: entry.type,
    message: entry.message,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    metadata: entry.metadata,
  }))]
    .sort((a: any, b: any) => {
      const left = new Date(a.createdAt || 0).getTime();
      const right = new Date(b.createdAt || 0).getTime();
      return right - left;
    });

  let group: { _id: string; name: string; image: string | null } | null = null;
  if (expense.group_id) {
    const groupRows = await fetchDocsByIds("groups", [String(expense.group_id)]);
    const groupRow = groupRows.get(String(expense.group_id));
    if (groupRow) {
      group = mapGroup(groupRow);
    }
  }

  const mappedParticipants = participants.map((participant: any) => {
    const user = usersMap.get(String(participant.user_id || ""));
    return {
      _id: String(participant.id || ""),
      expenseId: String(participant.expense_id || ""),
      userId: user ? mapUser(user) : null,
      paidAmount: toNum(participant.amount_paid),
      owedAmount: toNum(participant.amount_owed),
      isSettled: Boolean(participant.is_settled),
      createdAt: toIso(participant.created_at || participant._created_at),
      updatedAt: toIso(participant.updated_at || participant._updated_at),
    };
  });

  const creator = usersMap.get(String(expense.created_by || ""));
  const createdAt = toIso(expense.created_at || expense._created_at);
  const updatedAt = toIso(expense.updated_at || expense._updated_at);
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
      date: toIso(expense.date) || createdAt,
      currency: String(expense.currency || "INR"),
      createdBy: creator ? mapUser(creator) : null,
      groupId: group,
      images: Array.isArray(expense.images) ? expense.images : [],
      notes: expense.notes || "",
      paymentStatus,
      recurringTemplateId: expense.recurring_template_id || undefined,
      recurringRunId: expense.recurring_run_id || undefined,
      recurrenceOccurrenceDate: toIso(expense.recurrence_occurrence_date),
      isDeleted: Boolean(expense.is_deleted),
      editHistory: editHistoryRaw,
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
    const routeStart = Date.now();
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

    const cacheKey = buildUserScopedCacheKey("expenses", userId, `detail:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.expenses, async () =>
      buildExpenseResponse(id)
    );

    const routeMs = logSlowRoute("/api/expenses/[id]#GET", routeStart);
    return NextResponse.json(
      {
        expense: payload.expense,
      },
      {
        status: 200,
        headers: {
          ETag: payload.etag,
          "X-Version-Vector": JSON.stringify(payload.versionVector),
          "X-Doosplit-Route-Ms": String(routeMs),
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
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;
    const db = getAdminDb();

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
      participants,
      paymentStatus,
    } = body || {};

    const expense = await getExpenseRow(id);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const participantCheck = await isExpenseParticipant(id, currentUserId);
    if (!participantCheck) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (String(expense.created_by || "") !== currentUserId) {
      return NextResponse.json(
        { error: "Only expense creator can edit" },
        { status: 403 }
      );
    }

    const ifMatch = request.headers.get("If-Match");
    if (ifMatch) {
      const expectedEtag = `"${expense.id}-1"`;
      if (ifMatch !== expectedEtag) {
        return NextResponse.json(
          {
            error: "Conflict detected",
            message:
              "This expense has been modified by another user. Please refresh and try again.",
            currentVersion: 1,
          },
          { status: 409 }
        );
      }
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

    const previousParticipants = await getExpenseParticipants(id);

    const nowIso = new Date().toISOString();
    const changes: string[] = [];
    const diff: Record<string, { before: any; after: any }> = {};

    if (amount !== undefined && Number(amount) !== toNum(expense.amount)) {
      changes.push(`amount: ${toNum(expense.amount)} -> ${Number(amount)}`);
      diff.amount = {
        before: toNum(expense.amount),
        after: Number(amount),
      };
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
      const previousDate = toIso(expense.date || expense.created_at || expense._created_at);
      const nextDate = toIso(new Date(date).toISOString());
      if (previousDate !== nextDate) {
        diff.date = {
          before: previousDate,
          after: nextDate,
        };
      }
      changes.push("date updated");
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
      const previousImages = Array.isArray(expense.images) ? expense.images : [];
      const nextImages = Array.isArray(images) ? images : [];
      if (JSON.stringify(previousImages) !== JSON.stringify(nextImages)) {
        changes.push("attachments updated");
        diff.images = {
          before: previousImages,
          after: nextImages,
        };
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
        before: String(expense.split_method || "equally"),
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
    editHistory.push({
      id: newAppId(),
      editedAt: nowIso,
      editedBy: currentUserId,
      changes: changes.length > 0 ? changes.join(", ") : "Updated",
      diff,
    });

    const updatePayload: Record<string, any> = {
      edit_history: editHistory,
      updated_at: nowIso,
      _updated_at: FieldValue.serverTimestamp(),
    };
    if (amount !== undefined) updatePayload.amount = Number(amount);
    if (description !== undefined) updatePayload.description = String(description);
    if (category !== undefined) updatePayload.category = String(category);
    if (date !== undefined) updatePayload.date = new Date(date).toISOString();
    if (currency !== undefined) updatePayload.currency = String(currency);
    if (groupId !== undefined) updatePayload.group_id = groupId ? String(groupId) : null;
    if (images !== undefined) updatePayload.images = Array.isArray(images) ? images : [];
    if (notes !== undefined) updatePayload.notes = notes ? String(notes) : "";
    if (paymentStatus !== undefined) {
      if (!isPaymentStatus(paymentStatus)) {
        return NextResponse.json(
          { error: "Invalid payment status" },
          { status: 400 }
        );
      }
      updatePayload.payment_status = paymentStatus;
      updatePayload.payment_status_updated_at = nowIso;
      updatePayload.payment_status_updated_by = currentUserId;
    }

    await db.collection("expenses").doc(id).set(updatePayload, { merge: true });

    if (splitMethod && participants) {
      const finalAmount = amount !== undefined ? Number(amount) : toNum(expense.amount);
      let splitParticipants: any[] = [];

      switch (splitMethod) {
        case "equally":
          splitParticipants = splitEqually({
            amount: finalAmount,
            participants: participants.map((p: any) => toStringId(p.userId || p)),
            paidBy: toStringId(paidBy),
          });
          break;
        case "exact":
          splitParticipants = splitByExactAmounts({
            amount: finalAmount,
            participants: participants.map((p: any) => ({
              userId: toStringId(p.userId),
              owedAmount: Number(p.exactAmount || p.owedAmount || 0),
            })),
            paidBy: toStringId(paidBy),
          });
          break;
        case "percentage":
          splitParticipants = splitByPercentages({
            amount: finalAmount,
            participants: participants.map((p: any) => ({
              userId: toStringId(p.userId),
              percentage: Number(p.percentage || 0),
            })),
            paidBy: toStringId(paidBy),
          });
          break;
        case "shares":
          splitParticipants = splitByShares({
            amount: finalAmount,
            participants: participants.map((p: any) => ({
              userId: toStringId(p.userId),
              shares: Number(p.shares || 1),
            })),
            paidBy: toStringId(paidBy),
          });
          break;
        default:
          return NextResponse.json({ error: "Invalid split method" }, { status: 400 });
      }

      if (!validateSplit(splitParticipants, finalAmount)) {
        return NextResponse.json(
          { error: "Invalid split calculation" },
          { status: 400 }
        );
      }

      const existingParticipantsSnap = await db
        .collection("expense_participants")
        .where("expense_id", "==", id)
        .get();
      const batch = db.batch();
      for (const doc of existingParticipantsSnap.docs) {
        batch.delete(doc.ref);
      }
      for (const participant of splitParticipants) {
        const participantRef = db.collection("expense_participants").doc(newAppId());
        batch.set(participantRef, {
          id: participantRef.id,
          expense_id: id,
          user_id: toStringId(participant.userId),
          paid_amount: Number(participant.paidAmount || 0),
          owed_amount: Number(participant.owedAmount || 0),
          is_settled: false,
          created_at: nowIso,
          updated_at: nowIso,
          _created_at: FieldValue.serverTimestamp(),
          _updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const responsePayload = await buildExpenseResponse(id);
    const participantIds = responsePayload.expense.participants
      .map((participant: any) => participant.userId?._id)
      .filter(Boolean);
    const normalizedParticipantIds = participantIds
      .map((participantId: any) => String(participantId || ""))
      .filter(Boolean);

    let updaterName = auth.user.name || "Someone";

    try {
      const updaterDoc = await db.collection("users").doc(currentUserId).get();
      updaterName =
        String(updaterDoc.data()?.name || "").trim() || updaterName;
      await notifyExpenseUpdated(
        responsePayload.expense._id,
        responsePayload.expense.description,
        {
          id: currentUserId,
          name: updaterName,
        },
        participantIds
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    void logExpenseUpdated({
      actorId: currentUserId,
      actorName: updaterName,
      expenseId: String(responsePayload.expense._id || id),
      description: String(responsePayload.expense.description || "Expense"),
      amount: Number(responsePayload.expense.amount || 0),
      currency: String(responsePayload.expense.currency || "INR"),
      participantIds: normalizedParticipantIds,
      diff,
    });

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...previousParticipants.map((participant: any) => String(participant.user_id || "")),
      ...normalizedParticipantIds,
    ]);

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    const routeMs = logSlowRoute("/api/expenses/[id]#PUT", routeStart);
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
          "X-Doosplit-Route-Ms": String(routeMs),
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
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;
    const db = getAdminDb();

    const body = await request.json();
    const nextStatus = body?.paymentStatus;
    if (!isPaymentStatus(nextStatus)) {
      return NextResponse.json(
        { error: "Invalid payment status" },
        { status: 400 }
      );
    }

    const expense = await getExpenseRow(id);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const participantCheck = await isExpenseParticipant(id, currentUserId);
    if (!participantCheck) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const previousStatus = normalizePaymentStatus(expense.payment_status, "unpaid");
    if (previousStatus === nextStatus) {
      const payload = await buildExpenseResponse(id);
      const routeMs = logSlowRoute("/api/expenses/[id]#PATCH", routeStart);
      return NextResponse.json(
        {
          message: "Payment status unchanged",
          expense: payload.expense,
        },
        {
          status: 200,
          headers: {
            ETag: payload.etag,
            "X-Version-Vector": JSON.stringify(payload.versionVector),
            "X-Doosplit-Route-Ms": String(routeMs),
          },
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
        paymentStatus: {
          before: previousStatus,
          after: nextStatus,
        },
      },
    });

    await db.collection("expenses").doc(id).set(
      {
        payment_status: nextStatus,
        payment_status_updated_at: nowIso,
        payment_status_updated_by: currentUserId,
        edit_history: editHistory,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const participants = await getExpenseParticipants(id);
    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...participants.map((participant: any) => String(participant.user_id || "")),
    ]);

    const actorDoc = await db.collection("users").doc(currentUserId).get();
    const actorName =
      String(actorDoc.data()?.name || "").trim() || auth.user.name || "Someone";

    void logActivity({
      userIds: affectedUserIds,
      actorId: currentUserId,
      actorName,
      type: "expense_updated",
      title: "Payment Status Updated",
      description: `${actorName} marked "${String(expense.description || "Expense")}" as ${getPaymentStatusLabel(nextStatus)}`,
      metadata: {
        expenseId: String(expense.id || id),
        expenseDescription: String(expense.description || "Expense"),
        previousPaymentStatus: previousStatus,
        paymentStatus: nextStatus,
      },
    });

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    const payload = await buildExpenseResponse(id);
    const routeMs = logSlowRoute("/api/expenses/[id]#PATCH", routeStart);
    return NextResponse.json(
      {
        message: "Payment status updated successfully",
        expense: payload.expense,
      },
      {
        status: 200,
        headers: {
          ETag: payload.etag,
          "X-Version-Vector": JSON.stringify(payload.versionVector),
          "X-Doosplit-Route-Ms": String(routeMs),
        },
      }
    );
  } catch (error: any) {
    console.error("Update payment status error:", error);
    return NextResponse.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const routeStart = Date.now();
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const currentUserId = auth.user.id;
    const db = getAdminDb();

    const expense = await getExpenseRow(id);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const participantCheck = await isExpenseParticipant(id, currentUserId);
    if (!participantCheck) {
      return NextResponse.json(
        { error: "Only expense participants can delete" },
        { status: 403 }
      );
    }

    const participants = await getExpenseParticipants(id);
    const participantUserIds = (participants || [])
      .map((participant: any) => String(participant.user_id || ""))
      .filter(Boolean);
    const nowIso = new Date().toISOString();
    await db.collection("expenses").doc(id).set(
      {
        is_deleted: true,
        deleted_by: currentUserId,
        deleted_at: nowIso,
        updated_at: nowIso,
        _updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Touch expense_participants so the Firestore realtime listener fires
    // for every participant. Without this, soft-delete only updates the `expenses`
    // doc which is not watched by the client's onSnapshot queries.
    if (participants.length > 0) {
      const participantBatch = db.batch();
      for (const participant of participants) {
        const pRef = db.collection("expense_participants").doc(participant.id);
        participantBatch.update(pRef, {
          updated_at: nowIso,
          _updated_at: FieldValue.serverTimestamp(),
        });
      }
      await participantBatch.commit();
    }

    let deleterName = auth.user.name || "Someone";

    try {
      const deleterDoc = await db.collection("users").doc(currentUserId).get();
      deleterName =
        String(deleterDoc.data()?.name || "").trim() || deleterName;
      await notifyExpenseDeleted(
        String(expense.description || "Expense"),
        { id: currentUserId, name: deleterName },
        participantUserIds
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    void logExpenseDeleted({
      actorId: currentUserId,
      actorName: deleterName,
      expenseId: String(expense.id || id),
      description: String(expense.description || "Expense"),
      amount: toNum(expense.amount),
      currency: String(expense.currency || "INR"),
      participantIds: participantUserIds,
      before: {
        description: String(expense.description || "Expense"),
        amount: toNum(expense.amount),
        category: String(expense.category || "other"),
        date: toIso(expense.date || expense.created_at || expense._created_at),
        groupId: String(expense.group_id || ""),
        paymentStatus: String(expense.payment_status || "unpaid"),
      },
      after: {
        isDeleted: true,
      },
    });

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...participantUserIds,
    ]);

    await invalidateUsersCache(affectedUserIds, [...EXPENSE_MUTATION_CACHE_SCOPES]);

    const routeMs = logSlowRoute("/api/expenses/[id]#DELETE", routeStart);
    return NextResponse.json(
      { message: "Expense deleted successfully" },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(routeMs),
        },
      }
    );
  } catch (error: any) {
    console.error("Delete expense error:", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}

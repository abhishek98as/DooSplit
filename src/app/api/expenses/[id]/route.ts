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
      paidAmount: toNum(participant.paid_amount),
      owedAmount: toNum(participant.owed_amount),
      isSettled: Boolean(participant.is_settled),
      createdAt: toIso(participant.created_at || participant._created_at),
      updatedAt: toIso(participant.updated_at || participant._updated_at),
    };
  });

  const creator = usersMap.get(String(expense.created_by || ""));
  const createdAt = toIso(expense.created_at || expense._created_at);
  const updatedAt = toIso(expense.updated_at || expense._updated_at);
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
      isDeleted: Boolean(expense.is_deleted),
      editHistory: Array.isArray(expense.edit_history) ? expense.edit_history : [],
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

    const changes: string[] = [];
    if (amount !== undefined && Number(amount) !== toNum(expense.amount)) {
      changes.push(`amount: ${toNum(expense.amount)} -> ${Number(amount)}`);
    }
    if (description !== undefined && String(description) !== String(expense.description)) {
      changes.push("description updated");
    }
    if (category !== undefined && String(category) !== String(expense.category)) {
      changes.push(`category: ${expense.category} -> ${category}`);
    }
    if (date !== undefined) {
      changes.push("date updated");
    }

    const editHistory = Array.isArray(expense.edit_history) ? [...expense.edit_history] : [];
    editHistory.push({
      editedAt: new Date().toISOString(),
      editedBy: currentUserId,
      changes: changes.length > 0 ? changes.join(", ") : "Updated",
    });

    const nowIso = new Date().toISOString();
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

    try {
      const updaterDoc = await db.collection("users").doc(currentUserId).get();
      await notifyExpenseUpdated(
        responsePayload.expense._id,
        responsePayload.expense.description,
        {
          id: currentUserId,
          name: updaterDoc.data()?.name || "Someone",
        },
        participantIds
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...previousParticipants.map((participant: any) => String(participant.user_id || "")),
      ...participantIds.map((participantId: any) => String(participantId || "")),
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

    try {
      const deleterDoc = await db.collection("users").doc(currentUserId).get();
      await notifyExpenseDeleted(
        String(expense.description || "Expense"),
        { id: currentUserId, name: deleterDoc.data()?.name || "Someone" },
        (participants || []).map((participant: any) => String(participant.user_id || ""))
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    const affectedUserIds = uniqueStrings([
      currentUserId,
      ...(participants || []).map((participant: any) => String(participant.user_id || "")),
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


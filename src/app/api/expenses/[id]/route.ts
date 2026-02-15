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
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

function toStringId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

function toNumber(value: any): number {
  return Number(value || 0);
}

async function buildExpenseResponse(expenseId: string) {
  const supabase = requireSupabaseAdmin();

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (expenseError) {
    throw expenseError;
  }
  if (!expense) {
    throw new Error("Expense not found");
  }

  const { data: participants, error: participantsError } = await supabase
    .from("expense_participants")
    .select("*")
    .eq("expense_id", expenseId);
  if (participantsError) {
    throw participantsError;
  }

  const userIds = Array.from(
    new Set([
      String(expense.created_by),
      ...(participants || []).map((participant: any) => String(participant.user_id)),
    ])
  );
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id,name,email,profile_picture")
    .in("id", userIds.length > 0 ? userIds : ["__none__"]);
  if (usersError) {
    throw usersError;
  }
  const usersMap = new Map<string, any>(
    (users || []).map((user: any) => [String(user.id), user] as [string, any])
  );

  let group: { _id: string; name: string; image: string | null } | null = null;
  if (expense.group_id) {
    const { data: groupRow, error: groupError } = await supabase
      .from("groups")
      .select("id,name,image")
      .eq("id", expense.group_id)
      .maybeSingle();
    if (groupError) {
      throw groupError;
    }
    if (groupRow) {
      group = {
        _id: groupRow.id,
        name: groupRow.name,
        image: groupRow.image || null,
      };
    }
  }

  const mappedParticipants = (participants || []).map((participant: any) => {
    const user = usersMap.get(String(participant.user_id));
    return {
      _id: participant.id,
      expenseId: participant.expense_id,
      userId: user
        ? {
            _id: user.id,
            name: user.name,
            email: user.email,
            profilePicture: user.profile_picture || null,
          }
        : null,
      paidAmount: toNumber(participant.paid_amount),
      owedAmount: toNumber(participant.owed_amount),
      isSettled: !!participant.is_settled,
      createdAt: participant.created_at,
      updatedAt: participant.updated_at,
    };
  });

  const creator = usersMap.get(String(expense.created_by));
  const versionVector = {
    version: 1,
    lastModified: expense.updated_at,
    modifiedBy: expense.created_by,
  };

  return {
    expense: {
      _id: expense.id,
      amount: toNumber(expense.amount),
      description: expense.description,
      category: expense.category,
      date: expense.date,
      currency: expense.currency,
      createdBy: creator
        ? {
            _id: creator.id,
            name: creator.name,
            email: creator.email,
            profilePicture: creator.profile_picture || null,
          }
        : null,
      groupId: group,
      images: Array.isArray(expense.images) ? expense.images : [],
      notes: expense.notes,
      isDeleted: !!expense.is_deleted,
      editHistory: Array.isArray(expense.edit_history) ? expense.edit_history : [],
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
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
    const supabase = requireSupabaseAdmin();

    const { data: isParticipant, error: participantError } = await supabase
      .from("expense_participants")
      .select("id")
      .eq("expense_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (participantError) {
      throw participantError;
    }
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cacheKey = buildUserScopedCacheKey("expenses", userId, `detail:${id}`);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.expenses, async () =>
      buildExpenseResponse(id)
    );

    return NextResponse.json(
      {
        expense: payload.expense,
      },
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
    const supabase = requireSupabaseAdmin();

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

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();
    if (expenseError) {
      throw expenseError;
    }
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const { data: participantCheck, error: participantCheckError } = await supabase
      .from("expense_participants")
      .select("id")
      .eq("expense_id", id)
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (participantCheckError) {
      throw participantCheckError;
    }
    if (!participantCheck) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (String(expense.created_by) !== currentUserId) {
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

    const previousParticipantsResult = await supabase
      .from("expense_participants")
      .select("user_id")
      .eq("expense_id", id);
    if (previousParticipantsResult.error) {
      throw previousParticipantsResult.error;
    }
    const previousParticipants = previousParticipantsResult.data || [];

    const changes: string[] = [];
    if (amount !== undefined && Number(amount) !== toNumber(expense.amount)) {
      changes.push(`amount: ${toNumber(expense.amount)} -> ${Number(amount)}`);
    }
    if (description !== undefined && String(description) !== String(expense.description)) {
      changes.push(`description updated`);
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

    const updatePayload: Record<string, any> = {
      edit_history: editHistory,
      updated_at: new Date().toISOString(),
    };
    if (amount !== undefined) updatePayload.amount = Number(amount);
    if (description !== undefined) updatePayload.description = String(description);
    if (category !== undefined) updatePayload.category = String(category);
    if (date !== undefined) updatePayload.date = new Date(date).toISOString();
    if (currency !== undefined) updatePayload.currency = String(currency);
    if (groupId !== undefined) updatePayload.group_id = groupId ? String(groupId) : null;
    if (images !== undefined) updatePayload.images = Array.isArray(images) ? images : [];
    if (notes !== undefined) updatePayload.notes = notes ? String(notes) : "";

    const { error: updateError } = await supabase
      .from("expenses")
      .update(updatePayload)
      .eq("id", id);
    if (updateError) {
      throw updateError;
    }

    if (splitMethod && participants) {
      const finalAmount = amount !== undefined ? Number(amount) : toNumber(expense.amount);
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

      const { error: deleteParticipantsError } = await supabase
        .from("expense_participants")
        .delete()
        .eq("expense_id", id);
      if (deleteParticipantsError) {
        throw deleteParticipantsError;
      }

      const nowIso = new Date().toISOString();
      const rows = splitParticipants.map((participant) => ({
        id: newAppId(),
        expense_id: id,
        user_id: toStringId(participant.userId),
        paid_amount: Number(participant.paidAmount || 0),
        owed_amount: Number(participant.owedAmount || 0),
        is_settled: false,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      const { error: insertParticipantsError } = await supabase
        .from("expense_participants")
        .insert(rows);
      if (insertParticipantsError) {
        throw insertParticipantsError;
      }
    }

    const responsePayload = await buildExpenseResponse(id);
    const participantIds = responsePayload.expense.participants
      .map((participant: any) => participant.userId?._id)
      .filter(Boolean);

    try {
      const { data: updater } = await supabase
        .from("users")
        .select("id,name")
        .eq("id", currentUserId)
        .maybeSingle();
      await notifyExpenseUpdated(
        responsePayload.expense._id,
        responsePayload.expense.description,
        { id: currentUserId, name: updater?.name || "Someone" },
        participantIds
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    const affectedUserIds = Array.from(
      new Set(
        [
          currentUserId,
          ...previousParticipants.map((participant: any) => String(participant.user_id)),
          ...participantIds.map((participantId: any) => String(participantId)),
        ].filter(Boolean)
      )
    ) as string[];

    await invalidateUsersCache(affectedUserIds, [
      "expenses",
      "friends",
      "groups",
      "activities",
      "dashboard-activity",
      "friend-transactions",
      "friend-details",
      "user-balance",
      "analytics",
    ]);

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
    const currentUserId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();
    if (expenseError) {
      throw expenseError;
    }
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    if (String(expense.created_by) !== currentUserId) {
      return NextResponse.json(
        { error: "Only expense creator can delete" },
        { status: 403 }
      );
    }

    const { data: participants, error: participantsError } = await supabase
      .from("expense_participants")
      .select("user_id")
      .eq("expense_id", id);
    if (participantsError) {
      throw participantsError;
    }

    const { error: deleteError } = await supabase
      .from("expenses")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (deleteError) {
      throw deleteError;
    }

    try {
      const { data: deleter } = await supabase
        .from("users")
        .select("id,name")
        .eq("id", currentUserId)
        .maybeSingle();
      await notifyExpenseDeleted(
        String(expense.description || "Expense"),
        { id: currentUserId, name: deleter?.name || "Someone" },
        (participants || []).map((participant: any) => String(participant.user_id))
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    const affectedUserIds = Array.from(
      new Set([
        currentUserId,
        ...(participants || []).map((participant: any) => String(participant.user_id)),
      ])
    );

    await invalidateUsersCache(affectedUserIds, [
      "expenses",
      "friends",
      "groups",
      "activities",
      "dashboard-activity",
      "friend-transactions",
      "friend-details",
      "user-balance",
      "analytics",
    ]);

    return NextResponse.json(
      { message: "Expense deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Delete expense error:", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}

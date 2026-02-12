import { NextRequest, NextResponse } from "next/server";
import {
  splitEqually,
  splitByExactAmounts,
  splitByPercentages,
  splitByShares,
  validateSplit,
} from "@/lib/splitCalculator";
import { notifyExpenseCreated } from "@/lib/notificationService";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
  invalidateUsersCache,
} from "@/lib/cache";
import { supabaseReadRepository } from "@/lib/data/supabase-adapter";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function toStringId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const category = searchParams.get("category");
    const groupId = searchParams.get("groupId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const cacheKey = buildUserScopedCacheKey("expenses", userId, request.nextUrl.search);
    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.expenses,
      async () =>
        supabaseReadRepository.getExpenses({
          userId,
          page,
          limit,
          category,
          groupId,
          startDate,
          endDate,
        })
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "X-Doosplit-Cache": cacheStatus,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Get expenses error:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

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

    if (!amount || !description || !paidBy || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    if (images && Array.isArray(images)) {
      if (images.length > 10) {
        return NextResponse.json(
          { error: "Maximum 10 images allowed per expense" },
          { status: 400 }
        );
      }
      const invalidImages = images.filter(
        (img: any) => typeof img !== "string" || !img.trim()
      );
      if (invalidImages.length > 0) {
        return NextResponse.json(
          { error: "All image references must be valid strings" },
          { status: 400 }
        );
      }
    }

    let splitParticipants: any[] = [];
    const totalAmount = Number(amount);
    switch (splitMethod) {
      case "equally":
        splitParticipants = splitEqually({
          amount: totalAmount,
          participants: participants.map((p: any) => toStringId(p.userId || p)),
          paidBy: toStringId(paidBy),
        });
        break;
      case "exact":
        splitParticipants = splitByExactAmounts({
          amount: totalAmount,
          participants: participants.map((p: any) => ({
            userId: toStringId(p.userId),
            owedAmount: Number(p.exactAmount || 0),
          })),
          paidBy: toStringId(paidBy),
        });
        break;
      case "percentage":
        splitParticipants = splitByPercentages({
          amount: totalAmount,
          participants: participants.map((p: any) => ({
            userId: toStringId(p.userId),
            percentage: Number(p.percentage || 0),
          })),
          paidBy: toStringId(paidBy),
        });
        break;
      case "shares":
        splitParticipants = splitByShares({
          amount: totalAmount,
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

    if (!validateSplit(splitParticipants, totalAmount)) {
      return NextResponse.json({ error: "Invalid split calculation" }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const expenseId = newAppId();
    const nowIso = new Date().toISOString();
    const expenseDate = date || nowIso;
    const createdById = toStringId(paidBy);

    const { data: expenseRow, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        id: expenseId,
        amount: totalAmount,
        description: String(description),
        category: category || "other",
        date: expenseDate,
        currency: currency || "INR",
        created_by: createdById,
        group_id: groupId || null,
        images: Array.isArray(images) ? images : [],
        notes: notes || "",
        is_deleted: false,
        edit_history: [],
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (expenseError || !expenseRow) {
      throw expenseError || new Error("Failed to create expense");
    }

    const participantRows = splitParticipants.map((participant) => ({
      id: newAppId(),
      expense_id: expenseId,
      user_id: toStringId(participant.userId),
      paid_amount: Number(participant.paidAmount || 0),
      owed_amount: Number(participant.owedAmount || 0),
      is_settled: false,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    const { error: participantsError } = await supabase
      .from("expense_participants")
      .insert(participantRows);
    if (participantsError) {
      throw participantsError;
    }

    const userIds = Array.from(
      new Set([
        createdById,
        ...participantRows.map((participant) => participant.user_id),
      ])
    );
    const { data: users } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", userIds);
    const usersMap = new Map((users || []).map((row: any) => [String(row.id), row]));

    let group: any = null;
    if (groupId) {
      const { data: groupRow } = await supabase
        .from("groups")
        .select("id,name,image")
        .eq("id", String(groupId))
        .maybeSingle();
      if (groupRow) {
        group = {
          _id: groupRow.id,
          name: groupRow.name,
          image: groupRow.image || null,
        };
      }
    }

    const mappedParticipants = participantRows.map((participant) => {
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
        paidAmount: participant.paid_amount,
        owedAmount: participant.owed_amount,
        isSettled: participant.is_settled,
        createdAt: participant.created_at,
        updatedAt: participant.updated_at,
      };
    });

    const createdBy = usersMap.get(createdById);
    const versionVector = {
      version: 1,
      lastModified: expenseRow.updated_at,
      modifiedBy: expenseRow.created_by,
    };
    const etag = `"${expenseId}-1"`;

    try {
      await notifyExpenseCreated(
        expenseId,
        String(description),
        totalAmount,
        currency || "INR",
        { id: createdById, name: createdBy?.name || "Someone" },
        participantRows.map((participant) => participant.user_id),
        group?.name
      );
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    await invalidateUsersCache(
      Array.from(new Set([userId, ...participantRows.map((p) => p.user_id)])),
      [
        "expenses",
        "friends",
        "groups",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
        "user-balance",
        "analytics",
      ]
    );

    return NextResponse.json(
      {
        message: "Expense created successfully",
        expense: {
          _id: expenseRow.id,
          amount: Number(expenseRow.amount),
          description: expenseRow.description,
          category: expenseRow.category,
          date: expenseRow.date,
          currency: expenseRow.currency,
          createdBy: createdBy
            ? {
                _id: createdBy.id,
                name: createdBy.name,
                email: createdBy.email,
                profilePicture: createdBy.profile_picture || null,
              }
            : null,
          groupId: group,
          images: expenseRow.images || [],
          notes: expenseRow.notes,
          isDeleted: !!expenseRow.is_deleted,
          editHistory: expenseRow.edit_history || [],
          createdAt: expenseRow.created_at,
          updatedAt: expenseRow.updated_at,
          participants: mappedParticipants,
          _version: versionVector,
        },
      },
      {
        status: 201,
        headers: {
          ETag: etag,
          "X-Version-Vector": JSON.stringify(versionVector),
        },
      }
    );
  } catch (error: any) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}


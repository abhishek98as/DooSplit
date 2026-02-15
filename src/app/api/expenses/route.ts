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
import { requireUser } from "@/lib/auth/require-user";
import { firestoreReadRepository } from "@/lib/data/firestore-adapter";
import { createExpenseInFirestore } from "@/lib/firestore/write-operations";
import { getAdminDb } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

function toStringId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : value.toString();
}

function extractUserId(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if ("userId" in value) {
      return extractUserId(value.userId);
    }
    if ("id" in value) {
      return extractUserId(value.id);
    }
    if ("_id" in value) {
      return extractUserId(value._id);
    }
    if ("uid" in value) {
      return extractUserId(value.uid);
    }
  }

  return "";
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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
        firestoreReadRepository.getExpenses({
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

    const normalizedPaidBy = extractUserId(paidBy) || userId;
    const participantIds = uniqueIds(
      participants.map((p: any) => extractUserId(p?.userId ?? p))
    );

    if (!participantIds.includes(normalizedPaidBy)) {
      participantIds.unshift(normalizedPaidBy);
    }

    if (participantIds.length === 0) {
      return NextResponse.json(
        { error: "No valid participants provided" },
        { status: 400 }
      );
    }

    let splitParticipants: any[] = [];
    const totalAmount = Number(amount);
    switch (splitMethod) {
      case "equally":
        splitParticipants = splitEqually({
          amount: totalAmount,
          participants: participantIds,
          paidBy: normalizedPaidBy,
        });
        break;
      case "exact":
        {
          const exactParticipants = participants
            .map((p: any) => ({
              userId: extractUserId(p?.userId ?? p),
              owedAmount: Number(p?.exactAmount ?? p?.owedAmount ?? 0),
            }))
            .filter((p: any) => Boolean(p.userId));

          if (!exactParticipants.some((p: any) => p.userId === normalizedPaidBy)) {
            exactParticipants.push({ userId: normalizedPaidBy, owedAmount: 0 });
          }

        splitParticipants = splitByExactAmounts({
          amount: totalAmount,
            participants: exactParticipants,
            paidBy: normalizedPaidBy,
        });
        }
        break;
      case "percentage":
        {
          const percentageParticipants = participants
            .map((p: any) => ({
              userId: extractUserId(p?.userId ?? p),
              percentage: Number(p?.percentage || 0),
            }))
            .filter((p: any) => Boolean(p.userId));

          if (
            !percentageParticipants.some((p: any) => p.userId === normalizedPaidBy)
          ) {
            percentageParticipants.push({ userId: normalizedPaidBy, percentage: 0 });
          }

        splitParticipants = splitByPercentages({
          amount: totalAmount,
            participants: percentageParticipants,
            paidBy: normalizedPaidBy,
        });
        }
        break;
      case "shares":
        {
          const shareParticipants = participants
            .map((p: any) => ({
              userId: extractUserId(p?.userId ?? p),
              shares: Number(p?.shares || 1),
            }))
            .filter((p: any) => Boolean(p.userId));

          if (!shareParticipants.some((p: any) => p.userId === normalizedPaidBy)) {
            shareParticipants.push({ userId: normalizedPaidBy, shares: 0 });
          }

        splitParticipants = splitByShares({
          amount: totalAmount,
            participants: shareParticipants,
            paidBy: normalizedPaidBy,
        });
        }
        break;
      default:
        return NextResponse.json({ error: "Invalid split method" }, { status: 400 });
    }

    if (!validateSplit(splitParticipants, totalAmount)) {
      return NextResponse.json({ error: "Invalid split calculation" }, { status: 400 });
    }

    const createdById = userId;

    // Create expense in Firestore
    const nowIso = new Date().toISOString();
    const expenseData = {
      amount: totalAmount,
      description: String(description),
      category: category || "other",
      date: date || nowIso,
      currency: currency || "INR",
      created_by: createdById,
      group_id: groupId || null,
      images: Array.isArray(images) ? images : [],
      notes: notes || "",
      is_deleted: false,
      split_method: splitMethod || "equally",
    };

    const firestoreParticipants = splitParticipants.map((participant) => ({
      user_id: toStringId(participant.userId),
      paid_amount: Number(participant.paidAmount || 0),
      owed_amount: Number(participant.owedAmount || 0),
      is_settled: false,
    }));

    const expenseId = await createExpenseInFirestore(expenseData, firestoreParticipants);

    const affectedUserIds = uniqueIds([
      userId,
      ...firestoreParticipants.map((participant) => toStringId(participant.user_id)),
    ]);

    try {
      const db = getAdminDb();
      let groupName: string | undefined;
      if (groupId) {
        const groupDoc = await db.collection("groups").doc(String(groupId)).get();
        groupName = groupDoc.exists
          ? String(groupDoc.data()?.name || "").trim() || undefined
          : undefined;
      }

      await notifyExpenseCreated(
        expenseId,
        String(description),
        totalAmount,
        String(currency || "INR"),
        {
          id: userId,
          name: auth.user.name || "Someone",
        },
        affectedUserIds,
        groupName
      );

    } catch (notificationError) {
      console.error("Failed to send expense notifications:", notificationError);
    }

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

    // Return success response
    const responseExpense = {
      _id: expenseId,
      amount: totalAmount,
      description: String(description),
      category: category || "other",
      date: date || nowIso,
      currency: currency || "INR",
      createdBy: createdById,
      groupId: groupId || undefined,
      images: Array.isArray(images) ? images : [],
      notes: notes || "",
      participants: splitParticipants.map((participant) => ({
        userId: toStringId(participant.userId),
        paidAmount: Number(participant.paidAmount || 0),
        owedAmount: Number(participant.owedAmount || 0),
      })),
      splitMethod: splitMethod || "equally",
      version: 1,
      lastModified: nowIso,
      modifiedBy: userId,
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return NextResponse.json({
      success: true,
      expenseId,
      expense: responseExpense,
      message: "Expense created successfully",
    });
  } catch (error: any) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

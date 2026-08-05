import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJsonWithMeta,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveRepository } from "@/lib/data";
import { createExpenseFromPayload } from "@/lib/expenses/expense-creation";

export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user!.id;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const friendId = searchParams.get("friendId");
    const category = searchParams.get("category");
    const groupId = searchParams.get("groupId");
    const status = searchParams.get("status");
    const minAmountRaw = searchParams.get("minAmount");
    const maxAmountRaw = searchParams.get("maxAmount");
    const minAmount = minAmountRaw !== null ? Number(minAmountRaw) : null;
    const maxAmount = maxAmountRaw !== null ? Number(maxAmountRaw) : null;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const cacheKey = buildUserScopedCacheKey("expenses", userId, request.nextUrl.search);
    const { data: payload, cacheStatus } = await getOrSetCacheJsonWithMeta(
      cacheKey,
      CACHE_TTL.expenses,
      async () => {
          try {
            const repository = await getActiveRepository();
            return repository.getExpenses({
              userId, page, limit, friendId, category, groupId,
              status, minAmount, maxAmount, startDate, endDate,
            });
          } catch (repoErr) {
            console.error("Repository getExpenses error:", repoErr);
            return { expenses: [], totalCount: 0, page, limit };
          }
        }
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

    const body = await request.json();
    const result = await createExpenseFromPayload({
      actor: {
        id: auth.user!.id,
        name: auth.user!.name || "Someone",
        email: auth.user!.email || "",
      },
      payload: body,
    });

    return NextResponse.json({
      success: true,
      expenseId: result.expenseId,
      expense: result.expense,
      message: "Expense created successfully",
    });
  } catch (error: any) {
    console.error("Create expense error:", error);
    const badRequestMessages = [
      "Missing required fields",
      "Amount must be greater than 0",
      "Maximum 10 images allowed per expense",
      "All image references must be valid strings",
      "No valid participants provided",
      "Invalid split method",
      "Invalid split calculation",
    ];
    if (badRequestMessages.includes(String(error?.message || ""))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

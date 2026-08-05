import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  getUserBudgets,
  putUserBudgets,
  type UserBudgets,
} from "@/lib/dynamodb/entities/budgets";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = [
  "food",
  "transport",
  "shopping",
  "entertainment",
  "utilities",
  "healthcare",
  "rent",
  "travel",
  "other",
] as const;

// GET /api/budgets
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const budgets = await getUserBudgets(auth.user.id);
    return NextResponse.json({ budgets }, { status: 200 });
  } catch (error) {
    console.error("GET /api/budgets error:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
  }
}

// PUT /api/budgets
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json();
    const rawBudgets = body?.budgets;

    if (!rawBudgets || typeof rawBudgets !== "object") {
      return NextResponse.json(
        { error: "Invalid payload: budgets object required" },
        { status: 400 }
      );
    }

    const budgets: UserBudgets = {};
    for (const [category, entry] of Object.entries(rawBudgets)) {
      if (!ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
        continue;
      }
      const e = entry as { monthly?: number; currency?: string };
      const monthly = Math.max(0, Number(e?.monthly || 0));
      const currency = String(e?.currency || "INR");
      if (monthly > 0) {
        budgets[category] = { monthly, currency };
      }
    }

    await putUserBudgets(auth.user.id, budgets);
    return NextResponse.json({ budgets }, { status: 200 });
  } catch (error) {
    console.error("PUT /api/budgets error:", error);
    return NextResponse.json({ error: "Failed to save budgets" }, { status: 500 });
  }
}

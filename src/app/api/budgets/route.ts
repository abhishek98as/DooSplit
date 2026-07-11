import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";

export const dynamic = "force-dynamic";

export interface BudgetEntry {
  monthly: number;
  currency: string;
}

export type UserBudgets = Record<string, BudgetEntry>;

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

    const db = getAdminDb();
    const docRef = db.collection(COLLECTIONS.user_budgets).doc(auth.user.id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ budgets: {} }, { status: 200 });
    }

    const data: any = snap.data() || {};
    const budgets: UserBudgets = data.budgets || {};
    return NextResponse.json({ budgets }, { status: 200 });
  } catch (error) {
    console.error("GET /api/budgets error:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
  }
}

// PUT /api/budgets  — body: { budgets: { food: { monthly: 5000, currency: "INR" }, ... } }
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json();
    const rawBudgets = body?.budgets;

    if (!rawBudgets || typeof rawBudgets !== "object") {
      return NextResponse.json({ error: "Invalid payload: budgets object required" }, { status: 400 });
    }

    // Validate and sanitize
    const budgets: UserBudgets = {};
    for (const [category, entry] of Object.entries(rawBudgets)) {
      if (!ALLOWED_CATEGORIES.includes(category as any)) continue;
      const e = entry as any;
      const monthly = Math.max(0, Number(e?.monthly || 0));
      const currency = String(e?.currency || "INR");
      if (monthly > 0) {
        budgets[category] = { monthly, currency };
      }
    }

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    await db.collection(COLLECTIONS.user_budgets).doc(auth.user.id).set(
      {
        userId: auth.user.id,
        budgets,
        updatedAt: nowIso,
        _updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ budgets, message: "Budgets saved" }, { status: 200 });
  } catch (error) {
    console.error("PUT /api/budgets error:", error);
    return NextResponse.json({ error: "Failed to save budgets" }, { status: 500 });
  }
}

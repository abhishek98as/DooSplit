import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  createRecurringTemplate,
  listRecurringTemplates,
} from "@/lib/recurring/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const templates = await listRecurringTemplates(auth.user.id);
    return NextResponse.json({ recurringExpenses: templates }, { status: 200 });
  } catch (error) {
    console.error("List recurring expenses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recurring expenses" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const recurringExpense = await createRecurringTemplate(auth.user.id, body);
    return NextResponse.json({ recurringExpense }, { status: 201 });
  } catch (error: any) {
    console.error("Create recurring expense error:", error);
    const badRequestMessages = [
      "Missing required fields",
      "Amount must be greater than 0",
      "Maximum 10 images allowed per expense",
      "All image references must be valid strings",
      "Invalid recurrence date",
    ];
    return NextResponse.json(
      { error: error?.message || "Failed to create recurring expense" },
      { status: badRequestMessages.includes(String(error?.message || "")) ? 400 : 500 }
    );
  }
}

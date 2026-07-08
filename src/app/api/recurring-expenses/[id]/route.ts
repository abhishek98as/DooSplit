import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  assertTemplateAccess,
  endRecurringTemplate,
  getRecurringTemplate,
  mapRecurringTemplate,
  updateRecurringTemplate,
} from "@/lib/recurring/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const { id } = await params;
    const template = await getRecurringTemplate(id);
    assertTemplateAccess(template, auth.user.id);
    return NextResponse.json(
      { recurringExpense: mapRecurringTemplate(template) },
      { status: 200 }
    );
  } catch (error: any) {
    const message = String(error?.message || "");
    return NextResponse.json(
      { error: message || "Failed to fetch recurring expense" },
      { status: message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const { id } = await params;
    const body = await request.json();
    const recurringExpense = await updateRecurringTemplate(id, auth.user.id, body);
    return NextResponse.json({ recurringExpense }, { status: 200 });
  } catch (error: any) {
    const message = String(error?.message || "");
    return NextResponse.json(
      { error: message || "Failed to update recurring expense" },
      {
        status:
          message === "Only the owner can update this recurring expense"
            ? 403
            : message.includes("not found")
              ? 404
              : message.startsWith("Invalid") || message === "Missing required fields"
                ? 400
                : 500,
      }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const { id } = await params;
    const recurringExpense = await endRecurringTemplate(id, auth.user.id);
    return NextResponse.json({ recurringExpense, message: "Recurring expense ended" });
  } catch (error: any) {
    const message = String(error?.message || "");
    return NextResponse.json(
      { error: message || "Failed to end recurring expense" },
      { status: message.includes("owner") ? 403 : message.includes("not found") ? 404 : 500 }
    );
  }
}

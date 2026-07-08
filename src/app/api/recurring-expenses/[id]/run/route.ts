import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { runRecurringTemplate } from "@/lib/recurring/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await runRecurringTemplate({
      templateId: id,
      actorId: auth.user.id,
      force: body?.force !== false,
      occurrenceDate: body?.occurrenceDate ? String(body.occurrenceDate) : null,
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error: any) {
    const message = String(error?.message || "");
    return NextResponse.json(
      { error: message || "Failed to run recurring expense" },
      {
        status:
          message.includes("owner")
            ? 403
            : message.includes("not found")
              ? 404
              : message.includes("not active") || message.includes("Invalid")
                ? 400
                : 500,
      }
    );
  }
}

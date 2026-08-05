import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId } from "@/lib/ids";
import { putFeedback } from "@/lib/dynamodb/entities/feedback";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const message = String(body?.message || "").trim();
    const screen = String(body?.screen || "").trim();
    const type = String(body?.type || "missing_feature").trim() || "missing_feature";

    if (!message) {
      return NextResponse.json({ error: "Feedback message is required" }, { status: 400 });
    }

    if (message.length > 1200) {
      return NextResponse.json(
        { error: "Feedback message cannot exceed 1200 characters" },
        { status: 400 }
      );
    }

    const feedbackId = newAppId();
    const now = new Date();

    await putFeedback({
      id: feedbackId,
      category: type,
      title: screen || "Feedback",
      description: message,
      status: "new",
      priority: "medium",
      upvotes: 0,
      downvotes: 0,
      created_by: auth.user.id,
      created_at: now.toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        feedbackId,
        message: "Thanks for the feedback. We have recorded your request.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create feedback error:", error);
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}

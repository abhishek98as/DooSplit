import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { newAppId } from "@/lib/ids";

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

    const db = getAdminDb();
    const feedbackId = newAppId();
    const nowIso = new Date().toISOString();

    await db.collection(COLLECTIONS.featureFeedback).doc(feedbackId).set({
      id: feedbackId,
      type,
      message,
      screen: screen || null,
      created_by: auth.user.id,
      created_by_name: auth.user.name || "",
      created_by_email: auth.user.email || "",
      status: "new",
      created_at: nowIso,
      updated_at: nowIso,
      _created_at: FieldValue.serverTimestamp(),
      _updated_at: FieldValue.serverTimestamp(),
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

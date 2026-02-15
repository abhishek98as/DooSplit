import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";
import { getAdminDb, FieldValue } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const subscription = body?.subscription;
    const fcmToken = String(body?.fcmToken || "").trim();

    if ((!subscription || !subscription.endpoint) && !fcmToken) {
      return NextResponse.json(
        { error: "Invalid subscription request" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const db = getAdminDb();
    const updatePayload: Record<string, any> = {
      push_notifications_enabled: true,
      updated_at: nowIso,
      _updated_at: FieldValue.serverTimestamp(),
    };

    if (fcmToken) {
      updatePayload.fcm_tokens = FieldValue.arrayUnion(fcmToken);
    }

    if (subscription?.endpoint) {
      updatePayload.push_subscription = subscription;
    }

    await db.collection("users").doc(auth.user.id).set(updatePayload, { merge: true });

    const supabase = requireSupabaseAdmin();
    const legacyPayload: Record<string, any> = {
      push_notifications_enabled: true,
    };
    if (subscription?.endpoint) {
      legacyPayload.push_subscription = subscription;
    }

    const { error } = await supabase.from("users").update(legacyPayload).eq("id", auth.user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      message: "Successfully subscribed to push notifications",
      fcmRegistered: Boolean(fcmToken),
    });
  } catch (error: any) {
    console.error("Subscribe to notifications error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe to notifications" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json().catch(() => ({}));
    const fcmToken = String(body?.fcmToken || "").trim();

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    const firestorePayload: Record<string, any> = {
      updated_at: nowIso,
      _updated_at: FieldValue.serverTimestamp(),
    };

    if (fcmToken) {
      firestorePayload.fcm_tokens = FieldValue.arrayRemove(fcmToken);
    } else {
      firestorePayload.fcm_tokens = [];
      firestorePayload.push_subscription = null;
      firestorePayload.push_notifications_enabled = false;
    }

    await db.collection("users").doc(auth.user.id).set(firestorePayload, { merge: true });

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase.from("users").update({
      push_subscription: null,
      push_notifications_enabled: false,
    }).eq("id", auth.user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      message: "Successfully unsubscribed from push notifications",
    });
  } catch (error: any) {
    console.error("Unsubscribe from notifications error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe from notifications" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getUserById, updateUser } from "@/lib/dynamodb/entities/users";
import type { DdbUser } from "@/lib/dynamodb/types";

export const dynamic = "force-dynamic";

type UserPushRecord = DdbUser & {
  fcm_tokens?: string[];
  push_subscription?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const routeStart = Date.now();
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
    const existing = (await getUserById(auth.user.id)) as UserPushRecord | null;
    const tokens: string[] = Array.isArray(existing?.fcm_tokens) ? existing.fcm_tokens : [];
    if (fcmToken && !tokens.includes(fcmToken)) {
      tokens.push(fcmToken);
    }
    await updateUser(auth.user.id, {
      push_notifications_enabled: true,
      fcm_tokens: tokens,
      push_subscription: subscription || existing?.push_subscription || undefined,
      updated_at: nowIso,
    });

    return NextResponse.json({
      message: "Successfully subscribed to push notifications",
      fcmRegistered: Boolean(fcmToken),
    }, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
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
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json().catch(() => ({}));
    const fcmToken = String(body?.fcmToken || "").trim();

    const nowIso = new Date().toISOString();
    if (fcmToken) {
      const existing = (await getUserById(auth.user.id)) as UserPushRecord | null;
      const tokens: string[] = Array.isArray(existing?.fcm_tokens) ? existing.fcm_tokens : [];
      const filtered = tokens.filter((t) => t !== fcmToken);
      await updateUser(auth.user.id, {
        fcm_tokens: filtered,
        updated_at: nowIso,
      });
    } else {
      await updateUser(auth.user.id, {
        fcm_tokens: [],
        push_subscription: null,
        push_notifications_enabled: false,
        updated_at: nowIso,
      });
    }

    return NextResponse.json({
      message: "Successfully unsubscribed from push notifications",
    }, {
      status: 200,
      headers: {
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Unsubscribe from notifications error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe from notifications" },
      { status: 500 }
    );
  }
}

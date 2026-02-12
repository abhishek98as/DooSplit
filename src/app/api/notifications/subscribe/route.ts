import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const subscription = body?.subscription;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("users")
      .update({
        push_subscription: subscription,
        push_notifications_enabled: true,
      })
      .eq("id", auth.user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      message: "Successfully subscribed to push notifications",
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

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("users")
      .update({
        push_subscription: null,
        push_notifications_enabled: false,
      })
      .eq("id", auth.user.id);

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


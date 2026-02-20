import { NextRequest, NextResponse } from "next/server";
import { invalidateUsersCache } from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { mapUserRow, requireSupabaseAdmin } from "@/lib/supabase/app";
import { normalizeName } from "@/lib/social/keys";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const supabase = requireSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("users")
      .select(
        "id,email,name,phone,profile_picture,default_currency,language,timezone,push_notifications_enabled,email_notifications_enabled,push_subscription,role,is_active,is_dummy,auth_provider,email_verified,created_at,updated_at"
      )
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: mapUserRow(row) }, { status: 200 });
  } catch (error: any) {
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const {
      name,
      phone,
      profilePicture,
      defaultCurrency,
      language,
      timezone,
      pushNotificationsEnabled,
      emailNotificationsEnabled,
      pushSubscription,
    } = body || {};

    const updatePayload: Record<string, any> = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      updatePayload.name = trimmedName;
      updatePayload.name_normalized = normalizeName(trimmedName);
    }
    if (phone !== undefined) updatePayload.phone = phone ? String(phone).trim() : null;
    if (profilePicture !== undefined) updatePayload.profile_picture = profilePicture || null;
    if (defaultCurrency !== undefined) updatePayload.default_currency = defaultCurrency;
    if (language !== undefined) updatePayload.language = language;
    if (timezone !== undefined) updatePayload.timezone = timezone;
    if (pushNotificationsEnabled !== undefined) {
      updatePayload.push_notifications_enabled = !!pushNotificationsEnabled;
    }
    if (emailNotificationsEnabled !== undefined) {
      updatePayload.email_notifications_enabled = !!emailNotificationsEnabled;
    }
    if (pushSubscription !== undefined) {
      updatePayload.push_subscription = pushSubscription || null;
    }

    const supabase = requireSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", auth.user.id)
      .select(
        "id,email,name,phone,profile_picture,default_currency,language,timezone,push_notifications_enabled,email_notifications_enabled,push_subscription,role,is_active,is_dummy,auth_provider,email_verified,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await invalidateUsersCache(
      [auth.user.id],
      ["friends", "groups", "activities", "dashboard-activity", "friend-details", "expenses"]
    );

    return NextResponse.json(
      {
        message: "Profile updated successfully",
        user: mapUserRow(row),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

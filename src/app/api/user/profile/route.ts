import { NextRequest, NextResponse } from "next/server";
import { invalidateUsersCache } from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { normalizeName } from "@/lib/social/keys";

export const dynamic = "force-dynamic";

function mapUserRow(row: any) {
  if (!row) {
    return null;
  }
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    profilePicture: row.profile_picture ?? null,
    defaultCurrency: row.default_currency ?? "INR",
    language: row.language ?? "en",
    timezone: row.timezone ?? "Asia/Kolkata",
    pushNotificationsEnabled: !!row.push_notifications_enabled,
    emailNotificationsEnabled: row.email_notifications_enabled !== false,
    pushSubscription: row.push_subscription ?? null,
    role: row.role ?? "user",
    isActive: row.is_active !== false,
    isDummy: !!row.is_dummy,
    authProvider: row.auth_provider ?? "email",
    emailVerified: !!row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const db = getAdminDb();
    const doc = await db.collection("users").doc(auth.user.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const row = { id: doc.id, ...((doc.data() as any) || {}) };

    return NextResponse.json(
      { user: mapUserRow(row) },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
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
    const routeStart = Date.now();
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
    updatePayload.updated_at = new Date().toISOString();
    updatePayload._updated_at = FieldValue.serverTimestamp();

    const db = getAdminDb();
    const ref = db.collection("users").doc(auth.user.id);
    await ref.set(updatePayload, { merge: true });
    const updatedDoc = await ref.get();
    if (!updatedDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const row = { id: updatedDoc.id, ...(updatedDoc.data() || {}) };

    await invalidateUsersCache(
      [auth.user.id],
      ["friends", "groups", "activities", "dashboard-activity", "friend-details", "expenses"]
    );

    return NextResponse.json(
      {
        message: "Profile updated successfully",
        user: mapUserRow(row),
      },
      {
        status: 200,
        headers: {
          "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
        },
      }
    );
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}


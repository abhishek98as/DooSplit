import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export function requireSupabaseAdmin() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase service client is not configured");
  }
  return supabase;
}

export function newAppId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function mapUserRow(row: any) {
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


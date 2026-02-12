import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, code: string): NextResponse {
  const url = new URL("/auth/login", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = request.nextUrl.searchParams.get("next") || "/dashboard";

  if (!code) {
    return redirectWithError(request, "missing_oauth_code");
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return redirectWithError(request, "supabase_not_configured");
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    return redirectWithError(request, "oauth_exchange_failed");
  }

  const authUser = data.user;
  const authUid = authUser.id;
  const email = authUser.email?.toLowerCase().trim();

  if (email) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data: appUser, error: userError } = await admin
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!userError && appUser?.id) {
        await admin.from("user_identities").upsert(
          {
            auth_uid: authUid,
            user_id: appUser.id,
            provider: "supabase",
          },
          { onConflict: "auth_uid" }
        );
      }
    }
  }

  const url = new URL(nextPath, request.url);
  return NextResponse.redirect(url);
}

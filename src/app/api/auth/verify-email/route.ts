import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users")
      .select("id,reset_password_expires")
      .eq("reset_password_token", token)
      .eq("email_verified", false)
      .eq("auth_provider", "email")
      .gt("reset_password_expires", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!user) {
      const { data: expired } = await supabase
        .from("users")
        .select("id")
        .eq("reset_password_token", token)
        .eq("email_verified", false)
        .eq("auth_provider", "email")
        .maybeSingle();

      if (expired) {
        return NextResponse.redirect(
          new URL("/auth/verify-email?error=expired", request.url)
        );
      }

      return NextResponse.redirect(
        new URL("/auth/verify-email?error=invalid", request.url)
      );
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        email_verified: true,
        reset_password_token: null,
        reset_password_expires: null,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.redirect(
      new URL("/auth/verify-email?success=true", request.url)
    );
  } catch (error: any) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=server", request.url)
    );
  }
}


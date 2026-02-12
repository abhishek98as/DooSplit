import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmailVerification } from "@/lib/email";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users")
      .select("id,email,name,email_verified,auth_provider")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email address" },
        { status: 404 }
      );
    }
    if (user.email_verified) {
      return NextResponse.json(
        { error: "Email is already verified" },
        { status: 400 }
      );
    }
    if (user.auth_provider !== "email") {
      return NextResponse.json(
        { error: "This account uses a different authentication method" },
        { status: 400 }
      );
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        reset_password_token: verificationToken,
        reset_password_expires: verificationTokenExpires.toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const verificationUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;

    await sendEmailVerification({
      to: user.email,
      userName: user.name,
      verificationUrl,
    });

    return NextResponse.json(
      { message: "Verification email sent successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "Failed to resend verification email" },
      { status: 500 }
    );
  }
}


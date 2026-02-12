import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimitResult = checkRateLimit(request, RATE_LIMITS.passwordReset);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

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
      .select("id,email,name,auth_provider")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!user) {
      return NextResponse.json(
        { message: "If the email exists, a reset link will be sent" },
        { status: 200 }
      );
    }

    if (user.auth_provider === "firebase") {
      try {
        await sendPasswordResetEmail({
          to: user.email,
          userName: user.name || "User",
          resetLink: "",
          isFirebaseUser: true,
        });
      } catch (emailError) {
        console.error("Failed to send Firebase user password email:", emailError);
      }

      return NextResponse.json(
        {
          message:
            "This account uses Google sign-in. Please use Google to sign in, or check your email for instructions to set a password.",
        },
        { status: 200 }
      );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 3600000).toISOString();

    const { error: updateError } = await supabase
      .from("users")
      .update({
        reset_password_token: resetToken,
        reset_password_expires: resetTokenExpires,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        userName: user.name || "User",
        resetLink: resetUrl,
      });

      return NextResponse.json(
        {
          message:
            "Password reset email sent successfully. Please check your inbox.",
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            message:
              "Password reset email could not be sent, but you can use this link",
            resetUrl,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { message: "Failed to send reset email. Please try again later." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}


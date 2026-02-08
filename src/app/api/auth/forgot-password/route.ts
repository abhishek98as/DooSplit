import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Apply strict rate limiting for password reset
  const rateLimitResult = checkRateLimit(request, RATE_LIMITS.passwordReset);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // For security, don't reveal if email exists
      return NextResponse.json(
        { message: "If the email exists, a reset link will be sent" },
        { status: 200 }
      );
    }

    // Handle Firebase OAuth users differently
    if (user.authProvider === "firebase") {
      // For Firebase users, send a different email explaining they need to use Google sign-in
      try {
        await sendPasswordResetEmail({
          to: user.email,
          userName: user.name || "User",
          resetLink: "", // Empty link for Firebase users
          isFirebaseUser: true, // Special flag for Firebase users
        });

        return NextResponse.json(
          {
            message: "This account uses Google sign-in. Please use Google to sign in, or check your email for instructions to set a password.",
          },
          { status: 200 }
        );
      } catch (emailError) {
        console.error("Failed to send Firebase user email:", emailError);
        return NextResponse.json(
          {
            message: "This account uses Google sign-in. Please use Google to sign in to your account.",
          },
          { status: 200 }
        );
      }
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();

    // Build reset link
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const resetUrl = `${appUrl}/auth/reset-password?token=${resetToken}`;

    // Send email with reset link
    try {
      await sendPasswordResetEmail({
        to: user.email,
        userName: user.name || "User",
        resetLink: resetUrl,
      });

      return NextResponse.json(
        {
          message: "Password reset email sent successfully. Please check your inbox.",
        },
        { status: 200 }
      );
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      
      // Still return success with the link for development
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            message: "Password reset email could not be sent, but you can use this link",
            resetUrl,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          message: "Failed to send reset email. Please try again later.",
        },
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


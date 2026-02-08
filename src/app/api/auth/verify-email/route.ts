import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";

export const dynamic = 'force-dynamic';

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

    await dbConnect();

    // Find user with matching verification token that hasn't expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
      emailVerified: false,
      authProvider: "email", // Only for email/password accounts
    });

    if (!user) {
      // Token might be expired or invalid
      const expiredUser = await User.findOne({
        resetPasswordToken: token,
        emailVerified: false,
        authProvider: "email",
      });

      if (expiredUser) {
        // Token exists but expired
        return NextResponse.redirect(
          new URL("/auth/verify-email?error=expired", request.url)
        );
      } else {
        // Invalid token
        return NextResponse.redirect(
          new URL("/auth/verify-email?error=invalid", request.url)
        );
      }
    }

    // Mark user as verified and clear the token
    user.emailVerified = true;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Redirect to success page
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
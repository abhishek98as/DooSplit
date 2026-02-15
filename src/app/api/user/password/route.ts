import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminAuth, getAdminDb } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";

async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not configured");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
      cache: "no-store",
    }
  );

  if (response.ok) {
    return true;
  }

  const payload = await response.json().catch(() => null);
  const message = String(payload?.error?.message || "");
  if (
    message === "INVALID_LOGIN_CREDENTIALS" ||
    message === "INVALID_PASSWORD" ||
    message === "EMAIL_NOT_FOUND"
  ) {
    return false;
  }

  throw new Error(message || "Failed to verify current password");
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const firebaseUser = await adminAuth.getUser(auth.user.id);
    const hasPasswordProvider = firebaseUser.providerData.some(
      (provider) => provider.providerId === "password"
    );

    if (!hasPasswordProvider) {
      return NextResponse.json(
        { error: "Password login is not enabled for this account" },
        { status: 400 }
      );
    }

    let email = firebaseUser.email || auth.user.email || "";
    if (!email) {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(auth.user.id).get();
      email = String(userDoc.data()?.email || "");
    }

    if (!email) {
      return NextResponse.json(
        { error: "Unable to determine account email for password verification" },
        { status: 400 }
      );
    }

    const validCurrentPassword = await verifyCurrentPassword(email, currentPassword);
    if (!validCurrentPassword) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    await adminAuth.updateUser(auth.user.id, { password: newPassword });

    return NextResponse.json(
      { message: "Password updated successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Change password error:", error);
    const message = String(error?.message || "");

    if (message.includes("WEAK_PASSWORD")) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}

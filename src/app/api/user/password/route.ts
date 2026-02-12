import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body || {};

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("users")
      .select("id,password,auth_provider")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!row.password) {
      return NextResponse.json(
        { error: "Password login is not enabled for this account" },
        { status: 400 }
      );
    }

    const isPasswordValid = await bcrypt.compare(
      String(currentPassword),
      String(row.password)
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("id", auth.user.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      { message: "Password updated successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}


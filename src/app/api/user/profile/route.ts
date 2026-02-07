import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const user = await User.findById(session.user.id).select("-password");
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });
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
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, profilePicture, defaultCurrency, language, timezone } =
      body;

    await dbConnect();

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update fields
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone?.trim() || undefined;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (defaultCurrency) user.defaultCurrency = defaultCurrency;
    if (language) user.language = language;
    if (timezone) user.timezone = timezone;

    await user.save();

    return NextResponse.json(
      {
        message: "Profile updated successfully",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture,
          defaultCurrency: user.defaultCurrency,
          language: user.language,
          timezone: user.timezone,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

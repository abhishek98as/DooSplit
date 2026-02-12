import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get("q") || searchParams.get("query") || "").trim();

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const safe = escapeLike(query);
    const { data: users, error } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .neq("id", auth.user.id)
      .eq("is_dummy", false)
      .eq("is_active", true)
      .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .limit(10);

    if (error) {
      throw error;
    }

    const userIds = (users || []).map((u: any) => String(u.id));
    let friendshipMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: friendships, error: friendshipError } = await supabase
        .from("friendships")
        .select("friend_id,status")
        .eq("user_id", auth.user.id)
        .in("friend_id", userIds);

      if (friendshipError) {
        throw friendshipError;
      }

      friendshipMap = new Map(
        (friendships || []).map((f: any) => [String(f.friend_id), String(f.status)])
      );
    }

    const usersWithStatus = (users || []).map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      profilePicture: user.profile_picture || null,
      friendshipStatus: friendshipMap.get(String(user.id)) || "none",
    }));

    return NextResponse.json({ users: usersWithStatus }, { status: 200 });
  } catch (error: any) {
    console.error("Search users error:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}


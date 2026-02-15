import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const supabase = requireSupabaseAdmin();
    const { data: pendingRequests, error } = await supabase
      .from("friendships")
      .select("id,friend_id,created_at")
      .eq("user_id", auth.user.id)
      .eq("status", "pending")
      .neq("requested_by", auth.user.id);

    if (error) {
      throw error;
    }

    const friendIds = Array.from(
      new Set((pendingRequests || []).map((item: any) => String(item.friend_id)))
    );
    let usersMap = new Map<string, any>();
    if (friendIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id,name,email,profile_picture")
        .in("id", friendIds);
      if (usersError) {
        throw usersError;
      }
      usersMap = new Map<string, any>((users || []).map((u: any) => [String(u.id), u]));
    }

    const requests = (pendingRequests || []).map((req: any) => {
      const from = usersMap.get(String(req.friend_id));
      return {
        id: req.id,
        from: from
          ? {
              id: from.id,
              name: from.name,
              email: from.email,
              profilePicture: from.profile_picture || null,
            }
          : null,
        createdAt: req.created_at,
      };
    });

    return NextResponse.json({ requests }, { status: 200 });
  } catch (error: any) {
    console.error("Get pending requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending requests" },
      { status: 500 }
    );
  }
}



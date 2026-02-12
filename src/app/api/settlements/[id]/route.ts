import { NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
  invalidateUsersCache,
} from "@/lib/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const cacheKey = buildUserScopedCacheKey("settlement", userId, id);
    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.settlement, async () => {
      const { data: row, error } = await supabase
        .from("settlements")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!row) {
        throw new Error("Settlement not found");
      }
      if (row.from_user_id !== userId && row.to_user_id !== userId) {
        throw new Error("Forbidden");
      }

      const userIds = Array.from(new Set([row.from_user_id, row.to_user_id]));
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id,name,email,profile_picture")
        .in("id", userIds);
      if (usersError) {
        throw usersError;
      }
      const usersMap = new Map((users || []).map((u: any) => [String(u.id), u]));

      let groupData: { _id: string; name: string; image: string | null } | null = null;
      if (row.group_id) {
        const { data: group, error: groupError } = await supabase
          .from("groups")
          .select("id,name,image")
          .eq("id", row.group_id)
          .maybeSingle();
        if (groupError) {
          throw groupError;
        }
        if (group) {
          groupData = {
            _id: group.id,
            name: group.name,
            image: group.image || null,
          };
        }
      }

      const fromUser = usersMap.get(String(row.from_user_id));
      const toUser = usersMap.get(String(row.to_user_id));

      return {
        settlement: {
          _id: row.id,
          fromUserId: fromUser
            ? {
                _id: fromUser.id,
                name: fromUser.name,
                email: fromUser.email,
                profilePicture: fromUser.profile_picture || null,
              }
            : null,
          toUserId: toUser
            ? {
                _id: toUser.id,
                name: toUser.name,
                email: toUser.email,
                profilePicture: toUser.profile_picture || null,
              }
            : null,
          amount: Number(row.amount),
          currency: row.currency,
          method: row.method,
          note: row.note,
          screenshot: row.screenshot,
          date: row.date,
          groupId: groupData,
          version: row.version || 1,
          lastModified: row.last_modified || row.updated_at,
          modifiedBy: row.modified_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    if (error.message === "Settlement not found") {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("Get settlement error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlement" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: existing, error: readError } = await supabase
      .from("settlements")
      .select("id,from_user_id,to_user_id")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      throw readError;
    }
    if (!existing) {
      return NextResponse.json(
        { error: "Settlement not found" },
        { status: 404 }
      );
    }
    if (String(existing.from_user_id) !== userId) {
      return NextResponse.json(
        { error: "Only settlement sender can delete" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("settlements")
      .delete()
      .eq("id", id);
    if (deleteError) {
      throw deleteError;
    }

    await invalidateUsersCache(
      [String(existing.from_user_id), String(existing.to_user_id)],
      [
        "friends",
        "activities",
        "dashboard-activity",
        "friend-transactions",
        "friend-details",
        "user-balance",
        "settlements",
        "analytics",
      ]
    );

    return NextResponse.json(
      { message: "Settlement deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Delete settlement error:", error);
    return NextResponse.json(
      { error: "Failed to delete settlement" },
      { status: 500 }
    );
  }
}

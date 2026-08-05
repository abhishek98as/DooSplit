import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { listIncomingPendingFriendRequests } from "@/lib/social/friendship-store";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";

export const dynamic = "force-dynamic";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const pendingRequests = await listIncomingPendingFriendRequests(auth.user.id);
    const friendIds = uniqueStrings(
      pendingRequests.map((edge) => String(edge.data.requested_by || edge.data.friend_id || ""))
    );
    const ddbUsers = await getUsersByIds(friendIds);
    const usersMap = new Map<string, {
      id: string;
      name: string;
      email: string;
      profile_picture: string | null;
    }>();
    for (const u of ddbUsers) {
      if (u) {
        usersMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          profile_picture: u.photo_url || null,
        });
      }
    }

    const requests = pendingRequests.map((requestEdge) => {
      const fromUserId = String(requestEdge.data.requested_by || requestEdge.data.friend_id || "");
      const from = usersMap.get(fromUserId);
      return {
        id: requestEdge.id,
        from: from
          ? {
              id: from.id,
              name: from.name,
              email: from.email,
              profilePicture: from.profile_picture || null,
            }
          : null,
        createdAt: requestEdge.data.created_at || "",
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

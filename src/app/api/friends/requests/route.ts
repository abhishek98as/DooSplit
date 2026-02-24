import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { listIncomingPendingFriendRequests } from "@/lib/social/friendship-store";

export const dynamic = "force-dynamic";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function getUsersByIds(userIds: string[]): Promise<Map<string, any>> {
  const ids = uniqueStrings(userIds);
  if (ids.length === 0) {
    return new Map();
  }

  const db = getAdminDb();
  const users = new Map<string, any>();
  for (const idChunk of chunk(ids, 200)) {
    const refs = idChunk.map((id) => db.collection("users").doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        users.set(doc.id, {
          id: doc.id,
          ...((doc.data() as any) || {}),
        });
      }
    }
  }

  return users;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const pendingRequests = await listIncomingPendingFriendRequests(auth.user.id);
    const friendIds = uniqueStrings(
      pendingRequests.map((edge) => String(edge.data.friend_id || ""))
    );
    const usersMap = await getUsersByIds(friendIds);

    const requests = pendingRequests.map((requestEdge) => {
      const fromUserId = String(requestEdge.data.friend_id || "");
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



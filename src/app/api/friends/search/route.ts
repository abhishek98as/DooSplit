import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { normalizeName } from "@/lib/social/keys";

export const dynamic = "force-dynamic";

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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

function compareStatusPriority(status: string): number {
  if (status === "accepted") return 3;
  if (status === "pending") return 2;
  if (status === "rejected") return 1;
  return 0;
}

async function getFriendshipStatuses(
  userId: string,
  candidateIds: string[]
): Promise<Map<string, string>> {
  const ids = uniqueStrings(candidateIds);
  if (ids.length === 0) {
    return new Map();
  }

  const db = getAdminDb();
  const statuses = new Map<string, string>();
  for (const idChunk of chunk(ids, 30)) {
    const snap = await db
      .collection("friendships")
      .where("user_id", "==", userId)
      .where("friend_id", "in", idChunk)
      .get();
    for (const doc of snap.docs) {
      const row = doc.data() || {};
      const friendId = String(row.friend_id || "");
      const status = String(row.status || "none");
      const existing = statuses.get(friendId);
      if (!existing || compareStatusPriority(status) > compareStatusPriority(existing)) {
        statuses.set(friendId, status);
      }
    }
  }

  return statuses;
}

async function searchUsers(query: string, limit = 10): Promise<any[]> {
  const db = getAdminDb();
  const term = normalizeName(query);
  const max = `${term}\uf8ff`;
  const isEmailQuery = term.includes("@");

  if (isEmailQuery) {
    const snap = await db
      .collection("users")
      .where("email_normalized", ">=", term)
      .where("email_normalized", "<=", max)
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...((doc.data() as any) || {}) }));
  }

  const [nameSnap, emailSnap] = await Promise.all([
    db
      .collection("users")
      .where("name_normalized", ">=", term)
      .where("name_normalized", "<=", max)
      .limit(limit)
      .get(),
    db
      .collection("users")
      .where("email_normalized", ">=", term)
      .where("email_normalized", "<=", max)
      .limit(limit)
      .get(),
  ]);

  const dedup = new Map<string, any>();
  for (const doc of [...nameSnap.docs, ...emailSnap.docs]) {
    dedup.set(doc.id, { id: doc.id, ...((doc.data() as any) || {}) });
  }

  return Array.from(dedup.values()).slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const candidateUsers = await searchUsers(query, 15);
    const users = candidateUsers
      .filter((user) => String(user.id) !== userId)
      .filter((user) => Boolean(user.is_active !== false))
      .filter((user) => !Boolean(user.is_dummy))
      .slice(0, 10);

    const friendshipMap = await getFriendshipStatuses(
      userId,
      users.map((user) => String(user.id))
    );

    const usersWithStatus = users.map((user: any) => ({
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


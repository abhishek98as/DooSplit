import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { normalizeName } from "@/lib/social/keys";
import {
  getUserByEmail,
  searchUsersByNamePrefix,
} from "@/lib/dynamodb/entities/users";
import { getFriendship } from "@/lib/dynamodb/entities/friendships";

export const dynamic = "force-dynamic";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "")).filter(Boolean)));
}

async function getFriendshipStatuses(
  userId: string,
  candidateIds: string[]
): Promise<Map<string, string>> {
  const ids = uniqueStrings(candidateIds);
  const statuses = new Map<string, string>();
  await Promise.all(
    ids.map(async (friendId) => {
      const f = await getFriendship(userId, friendId);
      if (f) statuses.set(friendId, f.status);
    })
  );
  return statuses;
}

async function searchUsers(query: string, limit = 10) {
  const term = normalizeName(query);
  const results = new Map<string, any>();

  // Exact email hit (GSI1)
  if (term.includes("@")) {
    const byEmail = await getUserByEmail(term);
    if (byEmail) {
      results.set(byEmail.id, byEmail);
    }
  }

  // Name prefix via GSI3 (no Scan)
  const byName = await searchUsersByNamePrefix(term, limit);
  for (const user of byName) {
    results.set(user.id, user);
  }

  return Array.from(results.values())
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      profile_picture: item.photo_url || null,
      is_dummy: item.is_dummy,
      is_active: item.is_active,
    }));
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

    const usersWithStatus = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      profilePicture: user.profile_picture || null,
      friendshipStatus: friendshipMap.get(String(user.id)) || "none",
    }));

    return NextResponse.json({ users: usersWithStatus }, { status: 200 });
  } catch (error: unknown) {
    console.error("Search users error:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}

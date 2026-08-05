/**
 * Friendship store — DynamoDB-only.
 */
import { friendshipDocId } from "./keys";

export type FriendshipStatus = "pending" | "accepted" | "rejected";

interface FriendshipRow {
  id?: string;
  user_id?: string;
  friend_id?: string;
  status?: FriendshipStatus | "blocked" | "removed";
  requested_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FriendshipEdge {
  id: string;
  ref: { id: string };
  data: FriendshipRow;
  source: "deterministic" | "legacy";
}

export interface FriendshipPairLookup {
  forward: FriendshipEdge | null;
  reverse: FriendshipEdge | null;
  forwardDuplicates: FriendshipEdge[];
  reverseDuplicates: FriendshipEdge[];
}

function normalizeStatus(status: string): "none" | FriendshipStatus {
  if (status === "pending" || status === "accepted" || status === "rejected") {
    return status;
  }
  return "none";
}

function toEdge(row: {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  requested_by: string;
  created_at: string;
  updated_at: string;
} | null): FriendshipEdge | null {
  if (!row) return null;
  return {
    id: row.id,
    ref: { id: row.id },
    data: {
      id: row.id,
      user_id: row.user_id,
      friend_id: row.friend_id,
      status: row.status as FriendshipStatus,
      requested_by: row.requested_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    source: "deterministic",
  };
}

export async function getFriendshipPair(
  userId: string,
  friendId: string
): Promise<FriendshipPairLookup> {
  const { getFriendship } = await import("@/lib/dynamodb/entities/friendships");
  const [forward, reverse] = await Promise.all([
    getFriendship(userId, friendId),
    getFriendship(friendId, userId),
  ]);

  return {
    forward: toEdge(forward),
    reverse: toEdge(reverse),
    forwardDuplicates: [],
    reverseDuplicates: [],
  };
}

export async function getFriendshipStatus(
  userId: string,
  friendId: string
): Promise<{
  status: "none" | FriendshipStatus;
  forward: FriendshipEdge | null;
  reverse: FriendshipEdge | null;
}> {
  const pair = await getFriendshipPair(userId, friendId);
  if (!pair.forward && !pair.reverse) {
    return { status: "none", forward: null, reverse: null };
  }
  const status = normalizeStatus(
    pair.forward?.data.status || pair.reverse?.data.status || ""
  );
  return { status, forward: pair.forward, reverse: pair.reverse };
}

export async function upsertBidirectionalFriendship(params: {
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  requestedBy: string;
}): Promise<{
  forwardId: string;
  reverseId: string;
}> {
  const { putFriendshipBidirectional, getFriendship } = await import(
    "@/lib/dynamodb/entities/friendships"
  );
  const { newAppId } = await import("@/lib/ids");

  const existing = await getFriendship(params.userId, params.friendId);
  const now = new Date().toISOString();
  const id = existing?.id || newAppId();
  const createdAt = existing?.created_at || now;

  await putFriendshipBidirectional({
    id,
    user_id: params.userId,
    friend_id: params.friendId,
    status: params.status as "pending" | "accepted" | "blocked",
    requested_by: params.requestedBy,
    created_at: createdAt,
    updated_at: now,
  });

  return {
    forwardId: friendshipDocId(params.userId, params.friendId),
    reverseId: friendshipDocId(params.friendId, params.userId),
  };
}

export async function deleteBidirectionalFriendship(
  userId: string,
  friendId: string
): Promise<void> {
  const { deleteFriendshipBidirectional } = await import(
    "@/lib/dynamodb/entities/friendships"
  );
  await deleteFriendshipBidirectional(userId, friendId);
}

/** @deprecated alias */
export const removeBidirectionalFriendship = deleteBidirectionalFriendship;

export async function resolveFriendshipPairByAnyId(friendshipId: string): Promise<{
  userId: string;
  friendId: string;
  pair: FriendshipPairLookup;
} | null> {
  const { getFriendshipById } = await import("@/lib/dynamodb/entities/friendships");
  const item = await getFriendshipById(friendshipId);
  if (!item) return null;

  const userId = String(item.user_id || "");
  const friendId = String(item.friend_id || "");
  if (!userId || !friendId) return null;

  const pair = await getFriendshipPair(userId, friendId);
  return { userId, friendId, pair };
}

export async function listIncomingPendingFriendRequests(
  userId: string,
  limit = 200
): Promise<FriendshipEdge[]> {
  const { listReverseConnections } = await import(
    "@/lib/dynamodb/entities/friendships"
  );
  const reverse = await listReverseConnections(userId);
  return reverse
    .filter((r) => r.status === "pending" && r.requested_by !== userId)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      ref: { id: r.id },
      data: {
        id: r.id,
        user_id: r.user_id,
        friend_id: r.friend_id,
        status: r.status as FriendshipStatus,
        requested_by: r.requested_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      source: "deterministic" as const,
    }));
}

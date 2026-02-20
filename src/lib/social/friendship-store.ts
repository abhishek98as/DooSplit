import type { DocumentReference } from "firebase-admin/firestore";
import { FieldValue, getAdminDb } from "@/lib/firestore/admin";
import { friendshipDocId } from "./keys";

export type FriendshipStatus = "pending" | "accepted" | "rejected";

interface FriendshipRow {
  id?: string;
  user_id?: string;
  friend_id?: string;
  status?: FriendshipStatus;
  requested_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FriendshipEdge {
  id: string;
  ref: DocumentReference;
  data: FriendshipRow;
  source: "deterministic" | "legacy";
}

export interface FriendshipPairLookup {
  forward: FriendshipEdge | null;
  reverse: FriendshipEdge | null;
  forwardDuplicates: FriendshipEdge[];
  reverseDuplicates: FriendshipEdge[];
}

function toMillis(value: unknown): number {
  if (!value) {
    return 0;
  }
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof (value as any)?.toDate === "function") {
    return (value as any).toDate().getTime();
  }
  return 0;
}

function pickPrimaryEdge(edges: FriendshipEdge[]): FriendshipEdge | null {
  if (edges.length === 0) {
    return null;
  }
  return edges
    .slice()
    .sort((left, right) => {
      const leftScore = toMillis(left.data.updated_at || left.data.created_at);
      const rightScore = toMillis(right.data.updated_at || right.data.created_at);
      return rightScore - leftScore;
    })[0];
}

async function getEdgeLookup(
  userId: string,
  friendId: string
): Promise<{
  primary: FriendshipEdge | null;
  duplicates: FriendshipEdge[];
  deterministicRef: DocumentReference;
}> {
  const db = getAdminDb();
  const collection = db.collection("friendships");
  const deterministicId = friendshipDocId(userId, friendId);
  const deterministicRef = collection.doc(deterministicId);

  const [deterministicDoc, legacySnap] = await Promise.all([
    deterministicRef.get(),
    collection
      .where("user_id", "==", userId)
      .where("friend_id", "==", friendId)
      .limit(20)
      .get(),
  ]);

  const legacyEdges: FriendshipEdge[] = legacySnap.docs
    .map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as FriendshipRow,
      source: (doc.id === deterministicId ? "deterministic" : "legacy") as
        | "deterministic"
        | "legacy",
    }))
    .filter((edge) => edge.id !== deterministicId);

  if (deterministicDoc.exists) {
    return {
      primary: {
        id: deterministicDoc.id,
        ref: deterministicDoc.ref,
        data: (deterministicDoc.data() || {}) as FriendshipRow,
        source: "deterministic",
      },
      duplicates: legacyEdges,
      deterministicRef,
    };
  }

  const primaryLegacy = pickPrimaryEdge(legacyEdges);
  const duplicates = legacyEdges.filter((edge) => edge.id !== primaryLegacy?.id);

  return {
    primary: primaryLegacy,
    duplicates,
    deterministicRef,
  };
}

function normalizeStatus(value: unknown): FriendshipStatus {
  const status = String(value || "");
  if (status === "accepted" || status === "rejected" || status === "pending") {
    return status;
  }
  return "pending";
}

function makeEdgePayload(input: {
  id: string;
  userId: string;
  friendId: string;
  requestedBy: string;
  status: FriendshipStatus;
  nowIso: string;
  createdAt: string;
  includeCreatedServerTimestamp: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: input.id,
    user_id: input.userId,
    friend_id: input.friendId,
    status: input.status,
    requested_by: input.requestedBy,
    created_at: input.createdAt,
    updated_at: input.nowIso,
    _updated_at: FieldValue.serverTimestamp(),
  };

  if (input.includeCreatedServerTimestamp) {
    payload._created_at = FieldValue.serverTimestamp();
  }

  return payload;
}

export async function getFriendshipPair(
  userId: string,
  friendId: string
): Promise<FriendshipPairLookup> {
  const [forwardLookup, reverseLookup] = await Promise.all([
    getEdgeLookup(userId, friendId),
    getEdgeLookup(friendId, userId),
  ]);

  return {
    forward: forwardLookup.primary,
    reverse: reverseLookup.primary,
    forwardDuplicates: forwardLookup.duplicates,
    reverseDuplicates: reverseLookup.duplicates,
  };
}

export async function getFriendshipStatus(userId: string, friendId: string): Promise<{
  status: "none" | FriendshipStatus;
  forward: FriendshipEdge | null;
  reverse: FriendshipEdge | null;
}> {
  const pair = await getFriendshipPair(userId, friendId);
  const status = normalizeStatus(
    pair.forward?.data.status || pair.reverse?.data.status || ""
  );

  if (!pair.forward && !pair.reverse) {
    return {
      status: "none",
      forward: null,
      reverse: null,
    };
  }

  return {
    status,
    forward: pair.forward,
    reverse: pair.reverse,
  };
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
  const db = getAdminDb();
  const pair = await getFriendshipPair(params.userId, params.friendId);
  const nowIso = new Date().toISOString();

  const forwardId = friendshipDocId(params.userId, params.friendId);
  const reverseId = friendshipDocId(params.friendId, params.userId);

  const forwardCreatedAt = String(pair.forward?.data.created_at || nowIso);
  const reverseCreatedAt = String(pair.reverse?.data.created_at || nowIso);

  const writeBatch = db.batch();
  writeBatch.set(
    db.collection("friendships").doc(forwardId),
    makeEdgePayload({
      id: forwardId,
      userId: params.userId,
      friendId: params.friendId,
      requestedBy: params.requestedBy,
      status: params.status,
      nowIso,
      createdAt: forwardCreatedAt,
      includeCreatedServerTimestamp: pair.forward?.source !== "deterministic",
    }),
    { merge: true }
  );
  writeBatch.set(
    db.collection("friendships").doc(reverseId),
    makeEdgePayload({
      id: reverseId,
      userId: params.friendId,
      friendId: params.userId,
      requestedBy: params.requestedBy,
      status: params.status,
      nowIso,
      createdAt: reverseCreatedAt,
      includeCreatedServerTimestamp: pair.reverse?.source !== "deterministic",
    }),
    { merge: true }
  );
  await writeBatch.commit();

  const cleanupRefs = new Map<string, DocumentReference>();
  const maybeAddCleanup = (edge: FriendshipEdge | null) => {
    if (!edge || edge.source !== "legacy") {
      return;
    }
    cleanupRefs.set(edge.id, edge.ref);
  };

  maybeAddCleanup(pair.forward);
  maybeAddCleanup(pair.reverse);
  for (const duplicate of pair.forwardDuplicates) {
    cleanupRefs.set(duplicate.id, duplicate.ref);
  }
  for (const duplicate of pair.reverseDuplicates) {
    cleanupRefs.set(duplicate.id, duplicate.ref);
  }

  cleanupRefs.delete(forwardId);
  cleanupRefs.delete(reverseId);

  if (cleanupRefs.size > 0) {
    const cleanupBatch = db.batch();
    for (const ref of cleanupRefs.values()) {
      cleanupBatch.delete(ref);
    }
    await cleanupBatch.commit();
  }

  return { forwardId, reverseId };
}

export async function deleteBidirectionalFriendship(
  userId: string,
  friendId: string
): Promise<void> {
  const db = getAdminDb();
  const pair = await getFriendshipPair(userId, friendId);
  const refs = new Map<string, DocumentReference>();

  const addEdge = (edge: FriendshipEdge | null) => {
    if (!edge) {
      return;
    }
    refs.set(edge.id, edge.ref);
  };

  addEdge(pair.forward);
  addEdge(pair.reverse);
  for (const duplicate of pair.forwardDuplicates) {
    refs.set(duplicate.id, duplicate.ref);
  }
  for (const duplicate of pair.reverseDuplicates) {
    refs.set(duplicate.id, duplicate.ref);
  }

  if (refs.size === 0) {
    return;
  }

  const batch = db.batch();
  for (const ref of refs.values()) {
    batch.delete(ref);
  }
  await batch.commit();
}

export async function resolveFriendshipPairByAnyId(friendshipId: string): Promise<{
  userId: string;
  friendId: string;
  pair: FriendshipPairLookup;
} | null> {
  const db = getAdminDb();
  const directDoc = await db.collection("friendships").doc(friendshipId).get();

  let row = directDoc.exists ? (directDoc.data() as FriendshipRow) : null;
  if (!row) {
    const fallbackSnap = await db
      .collection("friendships")
      .where("id", "==", friendshipId)
      .limit(1)
      .get();
    row = fallbackSnap.empty ? null : (fallbackSnap.docs[0].data() as FriendshipRow);
  }

  if (!row) {
    return null;
  }

  const userId = String(row.user_id || "");
  const friendId = String(row.friend_id || "");
  if (!userId || !friendId) {
    return null;
  }

  const pair = await getFriendshipPair(userId, friendId);
  return { userId, friendId, pair };
}

export async function listIncomingPendingFriendRequests(
  userId: string,
  limit = 200
): Promise<FriendshipEdge[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection("friendships")
    .where("user_id", "==", userId)
    .where("status", "==", "pending")
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  const rows = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as FriendshipRow,
      source:
        doc.id === friendshipDocId(String(doc.data()?.user_id || ""), String(doc.data()?.friend_id || ""))
          ? ("deterministic" as const)
          : ("legacy" as const),
    }))
    .filter((edge) => String(edge.data.requested_by || "") !== userId);

  const dedup = new Map<string, FriendshipEdge>();
  for (const edge of rows) {
    const key = `${String(edge.data.user_id || "")}:${String(edge.data.friend_id || "")}`;
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, edge);
      continue;
    }

    const existingUpdated = toMillis(existing.data.updated_at || existing.data.created_at);
    const nextUpdated = toMillis(edge.data.updated_at || edge.data.created_at);
    if (nextUpdated > existingUpdated) {
      dedup.set(key, edge);
    }
  }

  return Array.from(dedup.values()).sort((left, right) => {
    const leftTime = toMillis(left.data.updated_at || left.data.created_at);
    const rightTime = toMillis(right.data.updated_at || right.data.created_at);
    return rightTime - leftTime;
  });
}

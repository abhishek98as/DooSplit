/**
 * DynamoDB implementation of the ReadRepository interface.
 * Returns the exact same response shapes as mongodb-adapter.ts.
 */
import type {
  ReadRepository,
  FriendsReadInput,
  FriendsPayload,
  GroupsReadInput,
  GroupsPayload,
  ExpensesReadInput,
  ExpensesPayload,
  DashboardActivityReadInput,
  DashboardActivityPayload,
  ActivitiesReadInput,
  ActivitiesPayload,
  SettlementsReadInput,
  SettlementsPayload,
} from "./types";
import {
  listFriendshipsForUser,
  getUsersByIds,
  listGroupsForUser,
  getGroupsByIds,
  listGroupMembers,
  queryUserExpenseFeed,
  queryUserSettlementFeed,
  queryActivitiesForUser,
  listExpenseIdsByParticipant,
} from "../dynamodb/entities";
import { batchGetItems, queryAll } from "../dynamodb/helpers";
import { PK, SK } from "../dynamodb/keys";
import { TABLE } from "../dynamodb/tables";

// ── Internal helpers (mirror of mongodb-adapter) ─────────────────────────────

function toIso(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any)?.toDate === "function") return (value as any).toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return "";
}

function toNumber(value: unknown): number {
  return Number(value || 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toDateMs(value: unknown): number {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mapUser(user: Record<string, unknown> | null | undefined) {
  if (!user) return null;
  return {
    _id: String(user.id || user._id || ""),
    name: String(user.name || "Unknown"),
    email: String(user.email || ""),
    profilePicture: user.photo_url || user.profile_picture || null,
    isDummy: Boolean(user.is_dummy),
  };
}

function mapGroup(group: Record<string, unknown> | null | undefined) {
  if (!group) return null;
  return {
    _id: String(group.id || group._id || ""),
    name: String(group.name || "Untitled Group"),
    image: group.image || null,
  };
}

// ── Balance helpers (same algorithm as balance-service.ts) ──────────────────

interface Transfer {
  from: string;
  to: string;
  amount: number;
}

function buildTransfersForExpense(participants: Array<{ user_id: string; amount_paid: number; amount_owed: number }>): Transfer[] {
  const netMap = new Map<string, number>();
  for (const p of participants) {
    const uid = String(p.user_id || "");
    if (!uid) continue;
    const net = toNumber(p.amount_paid) - toNumber(p.amount_owed);
    netMap.set(uid, round2((netMap.get(uid) || 0) + net));
  }

  const debtors: Array<{ userId: string; amount: number }> = [];
  const creditors: Array<{ userId: string; amount: number }> = [];
  for (const [userId, net] of netMap.entries()) {
    if (net < -0.01) debtors.push({ userId, amount: round2(Math.abs(net)) });
    else if (net > 0.01) creditors.push({ userId, amount: round2(net) });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const settled = round2(Math.min(d.amount, c.amount));
    if (settled > 0.01) transfers.push({ from: d.userId, to: c.userId, amount: settled });
    d.amount = round2(d.amount - settled);
    c.amount = round2(c.amount - settled);
    if (d.amount <= 0.01) i++;
    if (c.amount <= 0.01) j++;
  }
  return transfers;
}

async function computePairwiseBalancesForUserDynamo(
  userId: string,
  friendIds: string[]
): Promise<Map<string, number>> {
  const friendSet = new Set(friendIds);
  const balances = new Map<string, number>();

  // Step 1: Get all expense IDs where userId is a participant
  const myExpenseRefs = await listExpenseIdsByParticipant(userId);
  const myExpenseIds = myExpenseRefs.map((r) => r.expense_id);

  if (myExpenseIds.length > 0) {
    // Step 2: Fetch all expense participants (all users) for those expenses
    const allParticipantKeys = myExpenseIds.flatMap((eid) =>
      [...friendIds, userId].map((uid) => ({ PK: PK.expense(eid), SK: SK.part(uid) }))
    );

    // Deduplicate and batch-get
    const seen = new Set<string>();
    const uniqueKeys = allParticipantKeys.filter((k) => {
      const key = `${k.PK}|${k.SK}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const rawParticipants = await batchGetItems(uniqueKeys, TABLE);
    const participantsByExpense = new Map<string, Array<{ user_id: string; amount_paid: number; amount_owed: number }>>();

    for (const p of rawParticipants) {
      const eid = String((p as any).expense_id || "");
      if (!eid) continue;
      const list = participantsByExpense.get(eid) || [];
      list.push({
        user_id: String((p as any).user_id || ""),
        amount_paid: toNumber((p as any).amount_paid),
        amount_owed: toNumber((p as any).amount_owed),
      });
      participantsByExpense.set(eid, list);
    }

    // Step 3: Compute pairwise transfers using the same algorithm as balance-service.ts
    for (const [, rows] of participantsByExpense.entries()) {
      const transfers = buildTransfersForExpense(rows);
      for (const t of transfers) {
        if (t.from === userId || t.to === userId) {
          const otherId = t.from === userId ? t.to : t.from;
          if (!otherId || otherId === userId) continue;
          if (!friendSet.has(otherId)) continue;
          const delta = t.to === userId ? t.amount : -t.amount;
          balances.set(otherId, round2((balances.get(otherId) || 0) + delta));
        }
      }
    }
  }

  // Step 4: Factor in settlements from the user's settlement feed
  const { items: settlementItems } = await queryUserSettlementFeed(userId, 2000);
  for (const s of settlementItems) {
    const fromId = String(s.from_user_id || "");
    const toId = String(s.to_user_id || "");
    const amount = toNumber(s.amount);
    if (amount <= 0 || s.is_deleted) continue;

    if (fromId === userId && toId && friendSet.has(toId)) {
      balances.set(toId, round2((balances.get(toId) || 0) + amount));
    } else if (toId === userId && fromId && friendSet.has(fromId)) {
      balances.set(fromId, round2((balances.get(fromId) || 0) - amount));
    }
  }

  return balances;
}

// ── ReadRepository Implementation ────────────────────────────────────────────

async function getFriends(input: FriendsReadInput): Promise<FriendsPayload> {
  const friendships = await listFriendshipsForUser(input.userId, "accepted");
  if (friendships.length === 0) return { friends: [] };

  const friendIds = [...new Set(friendships.map((f) => f.friend_id))];
  const users = await getUsersByIds(friendIds);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const balanceMap = await computePairwiseBalancesForUserDynamo(input.userId, friendIds);

  let friends = friendships
    .map((row) => {
      const friendId = row.friend_id;
      const friendUser = usersById.get(friendId);
      if (!friendUser) return null;

      const name = String(friendUser.name || "").trim();
      const email = String(friendUser.email || "").trim();

      // Apply search filter
      if (input.requestSearch) {
        const q = input.requestSearch.toLowerCase();
        if (!name.toLowerCase().includes(q) && !email.toLowerCase().includes(q)) return null;
      }

      return {
        id: row.id,
        friend: {
          id: friendId,
          _id: friendId,
          name: name || email || "Unknown",
          email,
          profilePicture: friendUser.photo_url || null,
          isDummy: Boolean(friendUser.is_dummy),
        },
        balance: round2(balanceMap.get(friendId) || 0),
        friendshipDate: toIso(row.created_at),
      };
    })
    .filter(Boolean) as any[];

  friends.sort((a: any, b: any) => toDateMs(b.friendshipDate) - toDateMs(a.friendshipDate));
  return { friends };
}

async function getGroups(input: GroupsReadInput): Promise<GroupsPayload> {
  const memberships = await listGroupsForUser(input.userId);
  if (memberships.length === 0) return { groups: [] };

  const groupIds = [...new Set(memberships.map((m) => m.group_id))];
  const dbGroups = await getGroupsByIds(groupIds);
  const groupsById = new Map(dbGroups.map((g) => [g.id, g]));

  const roleByGroupId = new Map(memberships.map((m) => [m.group_id, m.role]));

  // Get all members for these groups
  const memberLists = await Promise.all(groupIds.map((gid) => listGroupMembers(gid)));
  const allMemberRows = memberLists.flat();

  const allUserIds = [...new Set([
    ...allMemberRows.map((m) => m.user_id),
    ...dbGroups.map((g) => g.created_by),
  ])];
  const users = await getUsersByIds(allUserIds);
  const usersById = new Map(users.map((u) => [u.id, u as unknown as Record<string, unknown>]));

  const membersByGroupId = new Map<string, any[]>();
  for (const row of allMemberRows) {
    const user = mapUser(usersById.get(row.user_id));
    const mapped = {
      _id: row.user_id,
      groupId: row.group_id,
      userId: user,
      role: row.role,
      joinedAt: toIso(row.joined_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
    const list = membersByGroupId.get(row.group_id) || [];
    list.push(mapped);
    membersByGroupId.set(row.group_id, list);
  }

  const groups = groupIds
    .map((gid) => {
      const row = groupsById.get(gid);
      if (!row || row.is_active === false) return null;

      // Apply search filter (extract 'search' param from URL query string)
      if (input.requestSearch) {
        const searchParams = new URLSearchParams(input.requestSearch);
        const searchTerm = searchParams.get("search") || "";
        if (searchTerm && !row.name.toLowerCase().includes(searchTerm.toLowerCase())) return null;
      }

      const members = membersByGroupId.get(gid) || [];
      const creator = mapUser(usersById.get(row.created_by));
      return {
        _id: row.id,
        name: row.name,
        description: row.description || "",
        image: null,
        type: "other",
        currency: row.currency || "INR",
        createdBy: creator,
        isActive: Boolean(row.is_active),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        members,
        memberCount: members.length,
        userRole: roleByGroupId.get(gid) || "member",
      };
    })
    .filter(Boolean) as any[];

  groups.sort((a: any, b: any) => toDateMs(b.createdAt) - toDateMs(a.createdAt));
  return { groups };
}

async function getExpenses(input: ExpensesReadInput): Promise<ExpensesPayload> {
  const filters = {
    groupId: input.groupId ?? undefined,
    category: input.category ?? undefined,
    startDate: input.startDate ?? undefined,
    endDate: input.endDate ?? undefined,
    isSettled: input.status === "settled" ? true : input.status === "unsettled" ? false : undefined,
  };

  // Fetch all matching expense feed items (for pagination + total count)
  const { items: allItems } = await queryUserExpenseFeed(input.userId, 5000, undefined, filters);

  // Friend filter: find intersection with friend's expense IDs
  let filteredItems = allItems;
  if (input.friendId) {
    const friendExpenseRefs = await listExpenseIdsByParticipant(input.friendId);
    const friendExpenseIds = new Set(friendExpenseRefs.map((r) => r.expense_id));
    filteredItems = allItems.filter((e) => friendExpenseIds.has(e.expense_id));
  }

  // Amount filter
  if (input.minAmount != null || input.maxAmount != null) {
    filteredItems = filteredItems.filter((e) => {
      const a = toNumber(e.amount);
      if (input.minAmount != null && a < input.minAmount) return false;
      if (input.maxAmount != null && a > input.maxAmount) return false;
      return true;
    });
  }

  // Sort by date DESC
  filteredItems.sort((a, b) => toDateMs(b.date) - toDateMs(a.date));

  const total = filteredItems.length;
  const skip = (input.page - 1) * input.limit;
  const pageFeedItems = filteredItems.slice(skip, skip + input.limit);

  if (pageFeedItems.length === 0) {
    return {
      expenses: [],
      pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) },
    };
  }

  // Fetch full participant lists for this page
  const pageExpenseIds = pageFeedItems.map((e) => e.expense_id);

  // Query participants for each expense in the page
  const participantArrays = await Promise.all(
    pageExpenseIds.map((eid) =>
      queryAll<Record<string, unknown>>({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": PK.expense(eid), ":prefix": "PART#" },
      })
    )
  );
  const allParticipantRows = participantArrays.flat();

  // Collect user IDs for enrichment
  const allUserIds = [...new Set([
    ...pageFeedItems.map((e) => e.created_by),
    ...allParticipantRows.map((p: any) => String(p.user_id || "")),
  ])];
  const users = await getUsersByIds(allUserIds);
  const usersById = new Map(users.map((u) => [u.id, u as unknown as Record<string, unknown>]));

  // Group IDs for enrichment
  const allGroupIds = [...new Set(pageFeedItems.map((e) => e.group_id).filter(Boolean) as string[])];
  const groups = await getGroupsByIds(allGroupIds);
  const groupsById = new Map(groups.map((g) => [g.id, g as unknown as Record<string, unknown>]));

  const participantsByExpense = new Map<string, any[]>();
  for (const row of allParticipantRows as any[]) {
    const eid = String(row.expense_id || "");
    const user = mapUser(usersById.get(String(row.user_id || "")));
    const mapped = {
      _id: String(row.user_id || ""),
      expenseId: eid,
      userId: user,
      paidAmount: toNumber(row.amount_paid),
      owedAmount: toNumber(row.amount_owed),
      isSettled: Boolean(row.is_settled),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
    const list = participantsByExpense.get(eid) || [];
    list.push(mapped);
    participantsByExpense.set(eid, list);
  }

  const mappedExpenses = pageFeedItems.map((feedItem) => {
    const eid = feedItem.expense_id;
    const creator = mapUser(usersById.get(feedItem.created_by));
    const group = feedItem.group_id ? mapGroup(groupsById.get(feedItem.group_id)) : null;
    const participants = participantsByExpense.get(eid) || [];
    return {
      _id: eid,
      amount: toNumber(feedItem.amount),
      description: feedItem.description,
      category: feedItem.category || "other",
      date: toIso(feedItem.date),
      currency: feedItem.currency || "INR",
      createdBy: creator,
      groupId: group,
      images: [],
      notes: "",
      isDeleted: Boolean(feedItem.is_deleted),
      paymentStatus: feedItem.is_settled ? "settled" : "unpaid",
      participants,
      createdAt: toIso(feedItem.created_at),
      updatedAt: toIso(feedItem.updated_at),
      splitMethod: feedItem.split_type || "equally",
    };
  });

  return {
    expenses: mappedExpenses,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}

async function getSettlements(input: SettlementsReadInput): Promise<SettlementsPayload> {
  const { items: allItems } = await queryUserSettlementFeed(input.userId, 5000, undefined, {
    groupId: input.groupId ?? undefined,
    friendId: input.friendId ?? undefined,
  });

  // Deduplicate (we store settlements for both from/to users — don't double-count)
  const seen = new Set<string>();
  const dedupedItems = allItems.filter((s) => {
    if (seen.has(s.settlement_id)) return false;
    seen.add(s.settlement_id);
    return true;
  });

  dedupedItems.sort((a, b) => toDateMs(b.date) - toDateMs(a.date));

  const total = dedupedItems.length;
  const skip = (input.page - 1) * input.limit;
  const paged = dedupedItems.slice(skip, skip + input.limit);

  const allUserIds = [...new Set(paged.flatMap((s) => [s.from_user_id, s.to_user_id]))];
  const users = await getUsersByIds(allUserIds);
  const usersById = new Map(users.map((u) => [u.id, u as unknown as Record<string, unknown>]));

  const allGroupIds = [...new Set(paged.map((s) => s.group_id).filter(Boolean) as string[])];
  const groups = await getGroupsByIds(allGroupIds);
  const groupsById = new Map(groups.map((g) => [g.id, g as unknown as Record<string, unknown>]));

  const mapped = paged.map((row) => ({
    _id: row.settlement_id,
    fromUserId: mapUser(usersById.get(row.from_user_id)),
    toUserId: mapUser(usersById.get(row.to_user_id)),
    groupId: row.group_id ? mapGroup(groupsById.get(row.group_id)) : null,
    amount: toNumber(row.amount),
    currency: row.currency || "INR",
    method: "cash",
    note: row.notes || "",
    screenshot: null,
    date: toIso(row.date),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));

  return {
    settlements: mapped,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}

async function getActivities(input: ActivitiesReadInput): Promise<ActivitiesPayload> {
  const { items: allItems } = await queryActivitiesForUser(
    input.userId, 5000, undefined, input.type
  );

  const total = allItems.length;
  const skip = (input.page - 1) * input.limit;
  const paged = allItems.slice(skip, skip + input.limit);

  const mapped = paged.map((row) => ({
    _id: row.id,
    userId: row.userId,
    actorId: row.actorId || "",
    actorName: row.actorName || "",
    type: row.type,
    title: "",
    description: row.description,
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt),
  }));

  return {
    activities: mapped,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}

async function getDashboardActivity(
  input: DashboardActivityReadInput
): Promise<DashboardActivityPayload> {
  const limit = input.limit || 10;
  const { items } = await queryActivitiesForUser(input.userId, limit);

  const mapped = items.slice(0, limit).map((row) => ({
    _id: row.id,
    userId: row.userId,
    actorId: row.actorId || "",
    actorName: row.actorName || "",
    type: row.type,
    title: "",
    description: row.description,
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt),
  }));

  return { activities: mapped };
}

// ── Exported ReadRepository ───────────────────────────────────────────────────

export const dynamodbReadRepository: ReadRepository = {
  getFriends,
  getGroups,
  getExpenses,
  getSettlements,
  getActivities,
  getDashboardActivity,
};

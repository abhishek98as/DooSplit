import type {
  ActivitiesPayload,
  ActivitiesReadInput,
  DashboardActivityPayload,
  DashboardActivityReadInput,
  ExpensesPayload,
  ExpensesReadInput,
  FriendsPayload,
  FriendsReadInput,
  GroupsPayload,
  GroupsReadInput,
  ReadRepository,
  SettlementsPayload,
  SettlementsReadInput,
} from "./types";
import { getAdminDb } from "@/lib/firestore/admin";
import { computePairwiseBalancesForUser } from "./balance-service";

function toIso(value: any): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return "";
}

function toNumber(value: any): number {
  return Number(value || 0);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toDateMs(value: any): number {
  const iso = toIso(value);
  if (!iso) {
    return 0;
  }
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

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

function mapUser(user: any) {
  if (!user) {
    return null;
  }
  return {
    _id: String(user.id || ""),
    name: String(user.name || "Unknown"),
    email: String(user.email || ""),
    profilePicture: user.profile_picture || user.profilePicture || null,
    isDummy: Boolean(user.is_dummy || user.isDummy),
  };
}

function mapGroup(group: any) {
  if (!group) {
    return null;
  }
  return {
    _id: String(group.id || ""),
    name: String(group.name || "Untitled Group"),
    image: group.image || null,
  };
}

async function fetchDocsByIds(
  collection: string,
  ids: string[]
): Promise<Map<string, any>> {
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const db = getAdminDb();
  const rows = new Map<string, any>();
  const refChunks = chunk(uniqueIds, 200);

  for (const idsChunk of refChunks) {
    const refs = idsChunk.map((id) => db.collection(collection).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        rows.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
      }
    }
  }

  return rows;
}

async function fetchExpenseParticipantsByExpenseIds(
  expenseIds: string[]
): Promise<any[]> {
  const ids = uniqueStrings(expenseIds);
  if (ids.length === 0) {
    return [];
  }

  const db = getAdminDb();
  const rows: any[] = [];
  const idChunks = chunk(ids, 30);

  for (const idsChunk of idChunks) {
    const snapshot = await db
      .collection("expense_participants")
      .where("expense_id", "in", idsChunk)
      .get();
    for (const doc of snapshot.docs) {
      rows.push({ id: doc.id, ...(doc.data() || {}) });
    }
  }

  return rows;
}

async function fetchGroupMembersByGroupIds(groupIds: string[]): Promise<any[]> {
  const ids = uniqueStrings(groupIds);
  if (ids.length === 0) {
    return [];
  }

  const db = getAdminDb();
  const rows: any[] = [];

  for (const idChunk of chunk(ids, 30)) {
    const [snakeSnapshot, camelSnapshot] = await Promise.all([
      db.collection("group_members").where("group_id", "in", idChunk).get(),
      db.collection("group_members").where("groupId", "in", idChunk).get(),
    ]);
    const dedup = new Map<string, any>();
    for (const doc of [...snakeSnapshot.docs, ...camelSnapshot.docs]) {
      dedup.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
    }
    for (const row of dedup.values()) {
      rows.push(row);
    }
  }

  return rows;
}

async function fetchSettlementsForUser(userId: string): Promise<any[]> {
  const db = getAdminDb();

  const [fromSnap, toSnap] = await Promise.all([
    db.collection("settlements").where("from_user_id", "==", userId).get(),
    db.collection("settlements").where("to_user_id", "==", userId).get(),
  ]);

  const dedup = new Map<string, any>();
  for (const doc of [...fromSnap.docs, ...toSnap.docs]) {
    dedup.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
  }

  return Array.from(dedup.values());
}

async function getFriends(input: FriendsReadInput): Promise<FriendsPayload> {
  const db = getAdminDb();

  const friendshipsSnap = await db
    .collection("friendships")
    .where("user_id", "==", input.userId)
    .where("status", "==", "accepted")
    .limit(2000)
    .get();

  if (friendshipsSnap.empty) {
    return { friends: [] };
  }

  const friendships = friendshipsSnap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: String(data.id || doc.id),
      friend_id: String(data.friend_id || ""),
      created_at: data.created_at || data._created_at || data.updated_at || "",
    };
  });

  const friendIds = uniqueStrings(friendships.map((row) => row.friend_id));
  const usersById = await fetchDocsByIds("users", friendIds);
  const balanceMap = await computePairwiseBalancesForUser(input.userId, {
    friendIds,
  });

  const friends = friendships
    .map((row) => {
      const friendId = row.friend_id;
      const friendUser = usersById.get(friendId);
      if (!friendUser) {
        return null;
      }

      const name = String(friendUser.name || "").trim();
      const email = String(friendUser.email || "").trim();

      return {
        id: row.id,
        friend: {
          id: friendId,
          _id: friendId,
          name: name || email || "Unknown",
          email,
          profilePicture:
            friendUser.profile_picture || friendUser.profilePicture || null,
          isDummy: Boolean(friendUser.is_dummy || friendUser.isDummy),
        },
        balance: round2(balanceMap.get(friendId) || 0),
        friendshipDate: toIso(row.created_at),
      };
    })
    .filter(Boolean) as any[];

  friends.sort((a: any, b: any) => {
    const left = new Date(a.friendshipDate || 0).getTime();
    const right = new Date(b.friendshipDate || 0).getTime();
    return right - left;
  });

  return { friends };
}

async function getGroups(input: GroupsReadInput): Promise<GroupsPayload> {
  const db = getAdminDb();

  const [snakeMembershipSnap, camelMembershipSnap] = await Promise.all([
    db.collection("group_members")
      .where("user_id", "==", input.userId)
      .limit(3000)
      .get(),
    db.collection("group_members")
      .where("userId", "==", input.userId)
      .limit(3000)
      .get(),
  ]);

  const memberships: any[] = Array.from(
    new Map(
      [...snakeMembershipSnap.docs, ...camelMembershipSnap.docs].map((doc) => [
        doc.id,
        {
          id: doc.id,
          ...(doc.data() || {}),
        },
      ])
    ).values()
  );

  if (memberships.length === 0) {
    return { groups: [] };
  }

  const groupIds = uniqueStrings(
    memberships.map((row) => String(row.group_id || row.groupId || ""))
  );
  const groupsById = await fetchDocsByIds("groups", groupIds);
  const memberRows = await fetchGroupMembersByGroupIds(groupIds);

  const roleByGroupId = new Map<string, string>();
  for (const row of memberships) {
    roleByGroupId.set(
      String(row.group_id || row.groupId || ""),
      String(row.role || "member")
    );
  }

  const usersById = await fetchDocsByIds(
    "users",
    uniqueStrings([
      ...memberRows.map((row) => String(row.user_id || row.userId || "")),
      ...groupIds.map((groupId) => String(groupsById.get(groupId)?.created_by || "")),
    ])
  );

  const membersByGroupId = new Map<string, any[]>();
  for (const row of memberRows) {
    const groupId = String(row.group_id || row.groupId || "");
    const user = mapUser(usersById.get(String(row.user_id || row.userId || "")));
    const mapped = {
      _id: String(row.id || ""),
      groupId,
      userId: user,
      role: String(row.role || "member"),
      joinedAt: toIso(row.joined_at || row.joinedAt || row.created_at || row._created_at),
      createdAt: toIso(row.created_at || row.createdAt || row._created_at),
      updatedAt: toIso(row.updated_at || row.updatedAt || row._updated_at),
    };
    const list = membersByGroupId.get(groupId) || [];
    list.push(mapped);
    membersByGroupId.set(groupId, list);
  }

  const groups = groupIds
    .map((groupId) => {
      const row = groupsById.get(groupId);
      if (!row || row.is_active === false) {
        return null;
      }

      const members = membersByGroupId.get(groupId) || [];
      const creator = mapUser(usersById.get(String(row.created_by || "")));
      const createdAt = toIso(row.created_at || row._created_at);
      const updatedAt = toIso(row.updated_at || row._updated_at);

      return {
        _id: String(row.id || groupId),
        name: String(row.name || "Untitled Group"),
        description: String(row.description || ""),
        image: row.image || null,
        type: String(row.type || "other"),
        currency: String(row.currency || "INR"),
        createdBy: creator,
        isActive: row.is_active !== false,
        createdAt,
        updatedAt,
        members,
        memberCount: members.length,
        userRole: roleByGroupId.get(groupId) || "member",
      };
    })
    .filter(Boolean) as any[];

  groups.sort((a: any, b: any) => toDateMs(b.createdAt) - toDateMs(a.createdAt));
  return { groups };
}

async function getExpenses(input: ExpensesReadInput): Promise<ExpensesPayload> {
  const db = getAdminDb();

  const participantLinksSnap = await db
    .collection("expense_participants")
    .where("user_id", "==", input.userId)
    .get();

  const allExpenseIds = uniqueStrings(
    participantLinksSnap.docs.map((doc) => String(doc.data()?.expense_id || ""))
  );

  if (allExpenseIds.length === 0) {
    return {
      expenses: [],
      pagination: {
        page: input.page,
        limit: input.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const expensesById = await fetchDocsByIds("expenses", allExpenseIds);
  let expenses = allExpenseIds
    .map((id) => expensesById.get(id))
    .filter(Boolean)
    .filter((row: any) => !Boolean(row.is_deleted));

  if (input.category) {
    expenses = expenses.filter(
      (row: any) => String(row.category || "other") === String(input.category)
    );
  }

  if (input.groupId) {
    if (input.groupId === "non-group") {
      expenses = expenses.filter((row: any) => !row.group_id);
    } else {
      expenses = expenses.filter(
        (row: any) => String(row.group_id || "") === String(input.groupId)
      );
    }
  }

  const startMs = input.startDate ? new Date(input.startDate).getTime() : NaN;
  const endMs = input.endDate ? new Date(input.endDate).getTime() : NaN;
  if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
    expenses = expenses.filter((row: any) => {
      const rowTime = toDateMs(row.date || row.created_at || row._created_at);
      if (Number.isFinite(startMs) && rowTime < startMs) {
        return false;
      }
      if (Number.isFinite(endMs) && rowTime > endMs) {
        return false;
      }
      return true;
    });
  }

  expenses.sort((a: any, b: any) => {
    const leftDate = toDateMs(a.date || a.created_at || a._created_at);
    const rightDate = toDateMs(b.date || b.created_at || b._created_at);
    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }
    const leftCreated = toDateMs(a.created_at || a._created_at);
    const rightCreated = toDateMs(b.created_at || b._created_at);
    return rightCreated - leftCreated;
  });

  const total = expenses.length;
  const skip = (input.page - 1) * input.limit;
  const pageExpenses = expenses.slice(skip, skip + input.limit);
  const pageExpenseIds = pageExpenses.map((row: any) => String(row.id || ""));

  const participantRows = await fetchExpenseParticipantsByExpenseIds(pageExpenseIds);
  const usersById = await fetchDocsByIds(
    "users",
    uniqueStrings([
      ...pageExpenses.map((row: any) => String(row.created_by || "")),
      ...participantRows.map((row: any) => String(row.user_id || "")),
    ])
  );
  const groupsById = await fetchDocsByIds(
    "groups",
    uniqueStrings(pageExpenses.map((row: any) => String(row.group_id || "")))
  );

  const participantsByExpense = new Map<string, any[]>();
  for (const row of participantRows) {
    const expenseId = String(row.expense_id || "");
    const userId = String(row.user_id || "");
    const user = mapUser(usersById.get(userId));
    const mapped = {
      _id: String(row.id || ""),
      expenseId,
      userId: user,
      paidAmount: toNumber(row.paid_amount),
      owedAmount: toNumber(row.owed_amount),
      isSettled: Boolean(row.is_settled),
      createdAt: toIso(row.created_at || row._created_at),
      updatedAt: toIso(row.updated_at || row._updated_at),
    };

    const list = participantsByExpense.get(expenseId) || [];
    list.push(mapped);
    participantsByExpense.set(expenseId, list);
  }

  const mappedExpenses = pageExpenses.map((row: any) => {
    const creator = mapUser(usersById.get(String(row.created_by || "")));
    const group = mapGroup(groupsById.get(String(row.group_id || "")));
    const createdAt = toIso(row.created_at || row._created_at);
    const updatedAt = toIso(row.updated_at || row._updated_at);

    return {
      _id: String(row.id || ""),
      amount: toNumber(row.amount),
      description: String(row.description || ""),
      category: String(row.category || "other"),
      date: toIso(row.date) || createdAt,
      currency: String(row.currency || "INR"),
      createdBy: creator,
      groupId: group,
      images: Array.isArray(row.images) ? row.images : [],
      notes: row.notes || "",
      isDeleted: Boolean(row.is_deleted),
      editHistory: Array.isArray(row.edit_history) ? row.edit_history : [],
      createdAt,
      updatedAt,
      participants: participantsByExpense.get(String(row.id || "")) || [],
      _version: {
        version: 1,
        lastModified: updatedAt || createdAt,
        modifiedBy: String(row.created_by || ""),
      },
    };
  });

  return {
    expenses: mappedExpenses,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

async function getSettlements(input: SettlementsReadInput): Promise<SettlementsPayload> {
  const rows = await fetchSettlementsForUser(input.userId);

  let filtered = rows;
  if (input.groupId) {
    filtered = filtered.filter(
      (row) => String(row.group_id || "") === String(input.groupId)
    );
  }
  if (input.friendId) {
    filtered = filtered.filter((row) => {
      const fromUserId = String(row.from_user_id || "");
      const toUserId = String(row.to_user_id || "");
      return fromUserId === String(input.friendId) || toUserId === String(input.friendId);
    });
  }

  filtered.sort((a, b) => {
    const left = toDateMs(a.date || a.created_at || a._created_at);
    const right = toDateMs(b.date || b.created_at || b._created_at);
    return right - left;
  });

  const total = filtered.length;
  const page = Math.max(1, input.page);
  const limit = Math.max(1, input.limit);
  const skip = (page - 1) * limit;
  const pageRows = filtered.slice(skip, skip + limit);

  const usersById = await fetchDocsByIds(
    "users",
    uniqueStrings([
      ...pageRows.map((row) => String(row.from_user_id || "")),
      ...pageRows.map((row) => String(row.to_user_id || "")),
    ])
  );
  const groupsById = await fetchDocsByIds(
    "groups",
    uniqueStrings(pageRows.map((row) => String(row.group_id || "")))
  );

  const settlements = pageRows.map((row) => ({
    _id: String(row.id || ""),
    amount: toNumber(row.amount),
    currency: String(row.currency || "INR"),
    method: String(row.method || "Cash"),
    note: String(row.note || row.notes || ""),
    screenshot: row.screenshot || null,
    date: toIso(row.date || row.created_at || row._created_at),
    createdAt: toIso(row.created_at || row._created_at),
    updatedAt: toIso(row.updated_at || row._updated_at),
    fromUserId: mapUser(usersById.get(String(row.from_user_id || ""))),
    toUserId: mapUser(usersById.get(String(row.to_user_id || ""))),
    groupId: mapGroup(groupsById.get(String(row.group_id || ""))),
  }));

  return {
    settlements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function buildUnifiedActivityFeed(
  userId: string,
  limit: number
): Promise<any[]> {
  const db = getAdminDb();
  const fetchLimit = Math.max(40, limit);

  const [recentExpenses, recentSettlements, friendshipsSnap, createdGroupsSnap] =
    await Promise.all([
      getExpenses({
        userId,
        page: 1,
        limit: fetchLimit,
      }),
      getSettlements({
        userId,
        page: 1,
        limit: fetchLimit,
      }),
      db.collection("friendships").where("user_id", "==", userId).limit(200).get(),
      db.collection("groups").where("created_by", "==", userId).limit(100).get(),
    ]);

  const friendships: any[] = friendshipsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));
  const friendUsersById = await fetchDocsByIds(
    "users",
    uniqueStrings(friendships.map((row) => String(row.friend_id || "")))
  );

  const activities: any[] = [];

  for (const expense of recentExpenses.expenses) {
    activities.push({
      id: String(expense._id || ""),
      type: "expense_added",
      expenseType: expense.groupId ? "group" : "non-group",
      description: expense.groupId
        ? `${expense.createdBy?.name || "Someone"} added "${expense.description}" in ${expense.groupId.name}`
        : `${expense.createdBy?.name || "Someone"} added "${expense.description}"`,
      amount: toNumber(expense.amount),
      currency: String(expense.currency || "INR"),
      createdAt: expense.createdAt || expense.date || new Date().toISOString(),
      user: expense.createdBy
        ? {
            id: String(expense.createdBy._id || ""),
            name: String(expense.createdBy.name || "Unknown"),
            profilePicture: expense.createdBy.profilePicture || null,
          }
        : null,
      group: expense.groupId
        ? {
            id: String(expense.groupId._id || ""),
            name: String(expense.groupId.name || "Group"),
          }
        : null,
    });
  }

  for (const settlement of recentSettlements.settlements) {
    const fromUserId = String(settlement.fromUserId?._id || "");
    const isOutgoing = fromUserId === userId;
    const otherUser = isOutgoing ? settlement.toUserId : settlement.fromUserId;

    activities.push({
      id: `settlement_${settlement._id}`,
      type: "settlement",
      description: isOutgoing
        ? `You paid ${otherUser?.name || "someone"}`
        : `${otherUser?.name || "Someone"} paid you`,
      amount: toNumber(settlement.amount),
      currency: String(settlement.currency || "INR"),
      createdAt: settlement.createdAt || settlement.date || new Date().toISOString(),
      user: otherUser
        ? {
            id: String(otherUser._id || ""),
            name: String(otherUser.name || "Unknown"),
            profilePicture: otherUser.profilePicture || null,
          }
        : null,
      group: settlement.groupId
        ? {
            id: String(settlement.groupId._id || ""),
            name: String(settlement.groupId.name || "Group"),
          }
        : null,
    });
  }

  for (const friendship of friendships) {
    const status = String(friendship.status || "");
    const friendUser = friendUsersById.get(String(friendship.friend_id || ""));
    if (!friendUser) {
      continue;
    }

    if (status === "accepted") {
      activities.push({
        id: `friend_${friendship.id}`,
        type: "friend_added",
        description: `You and ${friendUser.name || "a user"} are now friends`,
        createdAt:
          toIso(friendship.updated_at || friendship.created_at || friendship._created_at) ||
          new Date().toISOString(),
        user: {
          id: String(friendUser.id || ""),
          name: String(friendUser.name || "Unknown"),
          profilePicture: friendUser.profile_picture || friendUser.profilePicture || null,
        },
      });
    } else if (status === "pending") {
      const requestedBy = String(friendship.requested_by || "");
      const isIncoming = requestedBy !== userId;
      activities.push({
        id: `friend_pending_${friendship.id}`,
        type: isIncoming ? "friend_request" : "friend_request_sent",
        description: isIncoming
          ? `${friendUser.name || "Someone"} sent you a friend request`
          : `You sent a friend request to ${friendUser.name || "someone"}`,
        createdAt:
          toIso(friendship.updated_at || friendship.created_at || friendship._created_at) ||
          new Date().toISOString(),
        user: {
          id: String(friendUser.id || ""),
          name: String(friendUser.name || "Unknown"),
          profilePicture: friendUser.profile_picture || friendUser.profilePicture || null,
        },
      });
    }
  }

  for (const doc of createdGroupsSnap.docs) {
    const row = doc.data() || {};
    if (row.is_active === false) {
      continue;
    }
    activities.push({
      id: `group_${row.id || doc.id}`,
      type: "group_created",
      description: `You created group "${row.name || "Untitled Group"}"`,
      createdAt: toIso(row.created_at || row._created_at) || new Date().toISOString(),
      group: {
        id: String(row.id || doc.id),
        name: String(row.name || "Untitled Group"),
      },
    });
  }

  activities.sort((a, b) => {
    const left = toDateMs(a.createdAt);
    const right = toDateMs(b.createdAt);
    return right - left;
  });

  return activities;
}

async function getDashboardActivity(
  input: DashboardActivityReadInput
): Promise<DashboardActivityPayload> {
  const activities = await buildUnifiedActivityFeed(input.userId, 60);
  return { activities: activities.slice(0, 20) };
}

async function getActivities(input: ActivitiesReadInput): Promise<ActivitiesPayload> {
  const fetchLimit = Math.min(500, Math.max(120, input.page * input.limit * 3));
  const allActivities = await buildUnifiedActivityFeed(input.userId, fetchLimit);
  const total = allActivities.length;
  const skip = (input.page - 1) * input.limit;
  const activities = allActivities.slice(skip, skip + input.limit);

  return {
    activities,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export const firestoreReadRepository: ReadRepository = {
  getFriends,
  getGroups,
  getExpenses,
  getSettlements,
  getDashboardActivity,
  getActivities,
};

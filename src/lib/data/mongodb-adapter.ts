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
import {
  User,
  Friendship,
  Group,
  GroupMember,
  Expense,
  ExpenseParticipant,
  Settlement,
  ActivityLog,
} from "@/lib/mongodb/models";
import { computePairwiseBalancesForUser } from "./balance-service";
import {
  derivePaymentStatusFromSettledFlags,
  isPaymentStatus,
  normalizePaymentStatus,
} from "@/lib/expenses/payment-status";

// ── Helpers ──

function toIso(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
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
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || "")).filter(Boolean))];
}

function mapUser(user: any) {
  if (!user) return null;
  return {
    _id: String(user._id || ""),
    name: String(user.name || "Unknown"),
    email: String(user.email || ""),
    profilePicture: user.profile_picture || user.profilePicture || null,
    isDummy: Boolean(user.is_dummy || user.isDummy),
  };
}

function mapGroup(group: any) {
  if (!group) return null;
  return {
    _id: String(group._id || ""),
    name: String(group.name || "Untitled Group"),
    image: group.image || null,
  };
}

// ── MongoDB fetch helpers (no chunking needed — $in supports large arrays) ──

async function fetchDocsByIds(model: any, ids: string[]): Promise<Map<string, any>> {
  const unique = uniqueStrings(ids);
  if (unique.length === 0) return new Map();
  const docs = await model.find({ _id: { $in: unique } }).lean();
  const map = new Map<string, any>();
  for (const doc of docs) map.set(String(doc._id), doc);
  return map;
}

async function fetchExpenseParticipantsByExpenseIds(expenseIds: string[]): Promise<any[]> {
  const ids = uniqueStrings(expenseIds);
  if (ids.length === 0) return [];
  return ExpenseParticipant.find({ expense_id: { $in: ids } }).lean();
}

async function fetchGroupMembersByGroupIds(groupIds: string[]): Promise<any[]> {
  const ids = uniqueStrings(groupIds);
  if (ids.length === 0) return [];
  // Handle both snake_case (group_id) and legacy camelCase (groupId)
  const rows = await GroupMember.find({
    $or: [
      { group_id: { $in: ids } },
      { groupId: { $in: ids } },
    ],
  }).lean();
  return rows;
}

// ── ReadRepository Implementation ──

async function getFriends(input: FriendsReadInput): Promise<FriendsPayload> {
  const friendships = await Friendship.find({
    user_id: input.userId,
    status: "accepted",
  })
    .limit(2000)
    .lean();

  if (friendships.length === 0) return { friends: [] };

  const friendIds = uniqueStrings(friendships.map((f: any) => String(f.friend_id || "")));
  const usersById = await fetchDocsByIds(User, friendIds);
  const balanceMap = await computePairwiseBalancesForUser(input.userId, { friendIds });

  const friends = friendships
    .map((row: any) => {
      const friendId = String(row.friend_id || "");
      const friendUser = usersById.get(friendId);
      if (!friendUser) return null;

      const name = String(friendUser.name || "").trim();
      const email = String(friendUser.email || "").trim();

      return {
        id: String(row._id || ""),
        friend: {
          id: friendId,
          _id: friendId,
          name: name || email || "Unknown",
          email,
          profilePicture: friendUser.profile_picture || friendUser.profilePicture || null,
          isDummy: Boolean(friendUser.is_dummy || friendUser.isDummy),
        },
        balance: round2(balanceMap.get(friendId) || 0),
        friendshipDate: toIso(row.created_at),
      };
    })
    .filter(Boolean) as any[];

  friends.sort((a: any, b: any) => {
    return new Date(b.friendshipDate || 0).getTime() - new Date(a.friendshipDate || 0).getTime();
  });

  return { friends };
}

async function getGroups(input: GroupsReadInput): Promise<GroupsPayload> {
  // Find memberships — handle both key conventions
  const memberships = await GroupMember.find({
    $or: [
      { user_id: input.userId },
      { userId: input.userId },
    ],
  })
    .limit(3000)
    .lean();

  if (memberships.length === 0) return { groups: [] };

  const groupIds = uniqueStrings(
    memberships.map((m: any) => String(m.group_id || m.groupId || ""))
  );
  const groupsById = await fetchDocsByIds(Group, groupIds);
  const memberRows = await fetchGroupMembersByGroupIds(groupIds);

  const roleByGroupId = new Map<string, string>();
  for (const row of memberships as any[]) {
    roleByGroupId.set(
      String(row.group_id || row.groupId || ""),
      String(row.role || "member")
    );
  }

  const allUserIds = uniqueStrings([
    ...memberRows.map((r: any) => String(r.user_id || r.userId || "")),
    ...groupIds.map((gid) => String(groupsById.get(gid)?.created_by || "")),
  ]);
  const usersById = await fetchDocsByIds(User, allUserIds);

  const membersByGroupId = new Map<string, any[]>();
  for (const row of memberRows) {
    const gid = String(row.group_id || row.groupId || "");
    const user = mapUser(usersById.get(String(row.user_id || row.userId || "")));
    const mapped = {
      _id: String(row._id || ""),
      groupId: gid,
      userId: user,
      role: String(row.role || "member"),
      joinedAt: toIso(row.joined_at || row.joinedAt || row.created_at),
      createdAt: toIso(row.created_at || row.createdAt),
      updatedAt: toIso(row.updated_at || row.updatedAt),
    };
    const list = membersByGroupId.get(gid) || [];
    list.push(mapped);
    membersByGroupId.set(gid, list);
  }

  const groups = groupIds
    .map((gid) => {
      const row = groupsById.get(gid);
      if (!row || row.is_active === false) return null;

      const members = membersByGroupId.get(gid) || [];
      const creator = mapUser(usersById.get(String(row.created_by || "")));
      return {
        _id: String(row._id || gid),
        name: String(row.name || "Untitled Group"),
        description: String(row.description || ""),
        image: row.image || null,
        type: String(row.type || "other"),
        currency: String(row.currency || "INR"),
        createdBy: creator,
        isActive: row.is_active !== false,
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
  // Find all expense participants for this user
  const participantLinks = await ExpenseParticipant.find({ user_id: input.userId }).lean();
  const allExpenseIds = uniqueStrings(
    participantLinks.map((p: any) => String(p.expense_id || ""))
  );

  if (allExpenseIds.length === 0) {
    return { expenses: [], pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 0 } };
  }

  // Build query filter
  const query: Record<string, unknown> = {
    _id: { $in: allExpenseIds },
    is_deleted: { $ne: true },
  };

  // Friend filter: intersect with friend's expense IDs
  if (input.friendId && String(input.friendId).trim()) {
    const friendLinks = await ExpenseParticipant.find({
      user_id: String(input.friendId).trim(),
    }).lean();
    const friendExpenseIds = new Set(
      uniqueStrings(friendLinks.map((p: any) => String(p.expense_id || "")))
    );
    query._id = { $in: [...friendExpenseIds].filter((id) => allExpenseIds.includes(id)) };
  }

  // Category filter
  if (input.category) {
    query.category = input.category;
  }

  // Group filter
  if (input.groupId) {
    if (input.groupId === "non-group") {
      query.group_id = { $in: [null, "", undefined] };
    } else {
      query.group_id = input.groupId;
    }
  }

  let expenses = await Expense.find(query).lean();

  // Post-query filters
  if (input.status && isPaymentStatus(input.status)) {
    expenses = expenses.filter(
      (e: any) => normalizePaymentStatus(e.payment_status, "unpaid") === input.status
    );
  }

  const hasMin = Number.isFinite(Number(input.minAmount));
  const hasMax = Number.isFinite(Number(input.maxAmount));
  if (hasMin || hasMax) {
    const min = hasMin ? Number(input.minAmount) : -Infinity;
    const max = hasMax ? Number(input.maxAmount) : Infinity;
    expenses = expenses.filter((e: any) => {
      const a = toNumber(e.amount);
      return a >= min && a <= max;
    });
  }

  const startMs = input.startDate ? new Date(input.startDate).getTime() : NaN;
  const endMs = input.endDate ? new Date(input.endDate).getTime() : NaN;
  if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
    expenses = expenses.filter((e: any) => {
      const t = toDateMs(e.date || e.created_at);
      if (Number.isFinite(startMs) && t < startMs) return false;
      if (Number.isFinite(endMs) && t > endMs) return false;
      return true;
    });
  }

  // Sort by date DESC, then created_at DESC
  expenses.sort((a: any, b: any) => {
    const da = toDateMs(a.date || a.created_at);
    const db = toDateMs(b.date || b.created_at);
    if (db !== da) return db - da;
    return toDateMs(b.created_at) - toDateMs(a.created_at);
  });

  const total = expenses.length;
  const skip = (input.page - 1) * input.limit;
  const pageExpenses = expenses.slice(skip, skip + input.limit);
  const pageIds = pageExpenses.map((e: any) => String(e._id));

  // Enrich with participants, users, groups
  const participantRows = await fetchExpenseParticipantsByExpenseIds(pageIds);

  const allUserIds = uniqueStrings([
    ...pageExpenses.map((e: any) => String(e.created_by || "")),
    ...participantRows.map((p: any) => String(p.user_id || "")),
  ]);
  const usersById = await fetchDocsByIds(User, allUserIds);

  const allGroupIds = uniqueStrings(pageExpenses.map((e: any) => String(e.group_id || "")));
  const groupsById = await fetchDocsByIds(Group, allGroupIds);

  const participantsByExpense = new Map<string, any[]>();
  for (const row of participantRows) {
    const eid = String(row.expense_id || "");
    const user = mapUser(usersById.get(String(row.user_id || "")));
    const mapped = {
      _id: String(row._id || ""),
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

  const mappedExpenses = pageExpenses.map((row: any) => {
    const creator = mapUser(usersById.get(String(row.created_by || "")));
    const group = mapGroup(groupsById.get(String(row.group_id || "")));
    const participants = participantsByExpense.get(String(row._id)) || [];
    const settledFlags = participants.map((p: any) => Boolean(p.isSettled));
    const paymentStatus = isPaymentStatus(row.payment_status)
      ? row.payment_status
      : derivePaymentStatusFromSettledFlags(settledFlags, "unpaid");

    return {
      _id: String(row._id),
      amount: toNumber(row.amount),
      description: String(row.description || ""),
      category: String(row.category || "other"),
      date: toIso(row.date) || toIso(row.created_at),
      currency: String(row.currency || "INR"),
      createdBy: creator,
      groupId: group,
      images: Array.isArray(row.images) ? row.images : [],
      notes: row.notes || "",
      isDeleted: Boolean(row.is_deleted),
      paymentStatus,
      recurringTemplateId: row.recurring_template_id || undefined,
      recurringRunId: row.recurring_run_id || undefined,
      recurrenceOccurrenceDate: toIso(row.recurrence_occurrence_date),
      participants,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      splitMethod: row.split_method || "equally",
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
  const query: Record<string, unknown> = {
    $or: [{ from_user_id: input.userId }, { to_user_id: input.userId }],
  };

  if (input.groupId) query.group_id = input.groupId;
  if (input.friendId) {
    query.$or = [
      { from_user_id: input.userId, to_user_id: input.friendId },
      { from_user_id: input.friendId, to_user_id: input.userId },
    ];
  }

  const settlements = await Settlement.find(query)
    .sort({ date: -1 })
    .lean();

  const total = settlements.length;
  const skip = (input.page - 1) * input.limit;
  const paged = settlements.slice(skip, skip + input.limit);

  const allUserIds = uniqueStrings(
    paged.flatMap((s: any) => [String(s.from_user_id || ""), String(s.to_user_id || "")])
  );
  const usersById = await fetchDocsByIds(User, allUserIds);

  const allGroupIds = uniqueStrings(paged.map((s: any) => String(s.group_id || "")));
  const groupsById = await fetchDocsByIds(Group, allGroupIds);

  const mapped = paged.map((row: any) => ({
    _id: String(row._id),
    fromUserId: mapUser(usersById.get(String(row.from_user_id || ""))),
    toUserId: mapUser(usersById.get(String(row.to_user_id || ""))),
    groupId: mapGroup(groupsById.get(String(row.group_id || ""))),
    amount: toNumber(row.amount),
    currency: String(row.currency || "INR"),
    method: String(row.method || "cash"),
    note: row.note || "",
    screenshot: row.screenshot || null,
    date: toIso(row.date) || toIso(row.created_at),
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
  const query: Record<string, unknown> = { userId: input.userId };
  if (input.type) query.type = input.type;

  const activities = await ActivityLog.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const total = activities.length;
  const skip = (input.page - 1) * input.limit;
  const paged = activities.slice(skip, skip + input.limit);

  const mapped = paged.map((row: any) => ({
    _id: String(row._id),
    userId: String(row.userId || ""),
    actorId: String(row.actorId || ""),
    actorName: String(row.actorName || ""),
    type: String(row.type || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
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
  const activities = await ActivityLog.find({ userId: input.userId })
    .sort({ createdAt: -1 })
    .limit(input.limit || 10)
    .lean();

  const mapped = activities.map((row: any) => ({
    _id: String(row._id),
    userId: String(row.userId || ""),
    actorId: String(row.actorId || ""),
    actorName: String(row.actorName || ""),
    type: String(row.type || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt),
  }));

  return { activities: mapped };
}

// ── Exported ReadRepository ──

export const mongodbReadRepository: ReadRepository = {
  getFriends,
  getGroups,
  getExpenses,
  getSettlements,
  getActivities,
  getDashboardActivity,
};

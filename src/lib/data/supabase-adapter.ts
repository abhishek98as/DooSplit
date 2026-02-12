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
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function requireSupabase() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase service client not configured");
  }
  return supabase;
}

function mapUser(row: any) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    profilePicture: row.profile_picture || null,
    isDummy: row.is_dummy || false,
  };
}

function mapGroup(row: any) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    image: row.image || null,
  };
}

async function fetchUsersByIds(ids: string[]): Promise<Map<string, any>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) {
    return new Map();
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("id,name,email,profile_picture,is_dummy")
    .in("id", unique);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [row.id, row]));
}

async function fetchGroupsByIds(ids: string[]): Promise<Map<string, any>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) {
    return new Map();
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("groups")
    .select("id,name,image")
    .in("id", unique);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [row.id, row]));
}

async function getFriends(input: FriendsReadInput): Promise<FriendsPayload> {
  const supabase = requireSupabase();

  // Get friendships and user data in a single optimized query
  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("id,friend_id,created_at")
    .eq("user_id", input.userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });
  if (error) throw error;

  if (!friendships || friendships.length === 0) {
    return { friends: [] };
  }

  const friendIds = friendships.map((row: any) => row.friend_id);
  
  // Fetch all friend users in a single query
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id,name,email,profile_picture,is_dummy")
    .in("id", friendIds);
  if (usersError) throw usersError;

  const usersMap = new Map((usersData || []).map((row: any) => [row.id, row]));

  return {
    friends: friendships.map((row: any) => ({
      id: row.id,
      friend: mapUser(usersMap.get(row.friend_id)),
      balance: 0,
      friendshipDate: row.created_at,
    })),
  };
}

async function getGroups(input: GroupsReadInput): Promise<GroupsPayload> {
  const supabase = requireSupabase();

  // Step 1: Get user's group memberships (with role)
  const { data: membershipRows, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", input.userId);
  if (membershipError) throw membershipError;

  const groupIds = (membershipRows || []).map((row: any) => row.group_id);
  if (groupIds.length === 0) {
    return { groups: [] };
  }

  // Step 2: Batch fetch groups and all related data in parallel
  const [groupsResult, memberRowsResult] = await Promise.all([
    // Get active groups for this user
    supabase
      .from("groups")
      .select("*")
      .in("id", groupIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    // Get all members for these groups
    supabase
      .from("group_members")
      .select("*")
      .in("group_id", groupIds)
  ]);

  if (groupsResult.error) throw groupsResult.error;
  if (memberRowsResult.error) throw memberRowsResult.error;

  const groups = groupsResult.data || [];
  const memberRows = memberRowsResult.data || [];

  if (groups.length === 0) {
    return { groups: [] };
  }

  // Step 3: Fetch all users (members + creators) in a single query
  const allUserIds = Array.from(new Set([
    ...memberRows.map((row: any) => row.user_id),
    ...groups.map((row: any) => row.created_by)
  ]));

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id,name,email,profile_picture")
    .in("id", allUserIds);
  if (usersError) throw usersError;

  const usersMap = new Map((usersData || []).map((row: any) => [row.id, row]));

  // Create lookup maps for O(1) access
  const membersByGroup = new Map<string, any[]>();
  for (const member of memberRows) {
    const key = member.group_id;
    const list = membersByGroup.get(key) || [];
    list.push({
      _id: member.id,
      groupId: member.group_id,
      userId: mapUser(usersMap.get(member.user_id)),
      role: member.role,
      joinedAt: member.joined_at,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    });
    membersByGroup.set(key, list);
  }

  const roleByGroup = new Map(
    membershipRows.map((row: any) => [row.group_id, row.role])
  );

  return {
    groups: groups.map((group: any) => {
      const members = membersByGroup.get(group.id) || [];
      return {
        _id: group.id,
        name: group.name,
        description: group.description,
        image: group.image,
        type: group.type,
        currency: group.currency,
        createdBy: mapUser(usersMap.get(group.created_by)),
        isActive: group.is_active,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        memberCount: members.length,
        members,
        userRole: roleByGroup.get(group.id) || "member",
      };
    }),
  };
}

async function getExpenses(input: ExpensesReadInput): Promise<ExpensesPayload> {
  const supabase = requireSupabase();

  // Step 1: Get expense IDs for this user (optimized with index)
  const { data: participationRows, error: participationError } = await supabase
    .from("expense_participants")
    .select("expense_id")
    .eq("user_id", input.userId);
  if (participationError) throw participationError;

  const expenseIds = Array.from(
    new Set((participationRows || []).map((row: any) => row.expense_id))
  );
  if (expenseIds.length === 0) {
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

  // Step 2: Get filtered expenses with count (optimized with composite index)
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .in("id", expenseIds)
    .eq("is_deleted", false);

  if (input.category) query = query.eq("category", input.category);
  if (input.groupId) {
    if (input.groupId === "non-group") {
      query = query.is("group_id", null);
    } else {
      query = query.eq("group_id", input.groupId);
    }
  }
  if (input.startDate) query = query.gte("date", input.startDate);
  if (input.endDate) query = query.lte("date", input.endDate);

  const skip = (input.page - 1) * input.limit;
  const { data: expenses, count, error } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(skip, skip + input.limit - 1);
  if (error) throw error;

  if (!expenses || expenses.length === 0) {
    return {
      expenses: [],
      pagination: {
        page: input.page,
        limit: input.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / input.limit),
      },
    };
  }

  // Step 3: Batch fetch all required related data in parallel
  const expenseIdsOnPage = expenses.map((row: any) => row.id);
  const creatorIds = expenses.map((row: any) => row.created_by);
  const groupIds = expenses.map((row: any) => row.group_id).filter(Boolean);

  const [participantRows, users, groups] = await Promise.all([
    // Get participants for all expenses on this page
    supabase
      .from("expense_participants")
      .select("*")
      .in("expense_id", expenseIdsOnPage),
    // Get all users (creators + participants) in one query
    supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", Array.from(new Set([...creatorIds, ...participationRows.map((p: any) => p.user_id)]))),
    // Get all groups in one query
    groupIds.length > 0
      ? supabase.from("groups").select("id,name,image").in("id", groupIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (participantRows.error) throw participantRows.error;
  if (users.error) throw users.error;
  if (groups.error) throw groups.error;

  // Create lookup maps for O(1) access
  const usersMap = new Map((users.data || []).map((row: any) => [row.id, row]));
  const groupsMap = new Map((groups.data || []).map((row: any) => [row.id, row]));

  // Group participants by expense for O(1) lookup
  const participantsByExpense = new Map<string, any[]>();
  for (const participant of participantRows.data || []) {
    const key = participant.expense_id;
    const list = participantsByExpense.get(key) || [];
    list.push({
      _id: participant.id,
      expenseId: participant.expense_id,
      userId: mapUser(usersMap.get(participant.user_id)),
      paidAmount: Number(participant.paid_amount || 0),
      owedAmount: Number(participant.owed_amount || 0),
      isSettled: !!participant.is_settled,
      createdAt: participant.created_at,
      updatedAt: participant.updated_at,
    });
    participantsByExpense.set(key, list);
  }

  const mapped = expenses.map((expense: any) => ({
    _id: expense.id,
    amount: Number(expense.amount),
    description: expense.description,
    category: expense.category,
    date: expense.date,
    currency: expense.currency,
    createdBy: mapUser(usersMap.get(expense.created_by)),
    groupId: mapGroup(groupsMap.get(expense.group_id)),
    images: Array.isArray(expense.images) ? expense.images : [],
    notes: expense.notes,
    isDeleted: !!expense.is_deleted,
    editHistory: Array.isArray(expense.edit_history) ? expense.edit_history : [],
    createdAt: expense.created_at,
    updatedAt: expense.updated_at,
    participants: participantsByExpense.get(expense.id) || [],
    _version: {
      version: 1,
      lastModified: expense.updated_at,
      modifiedBy: expense.created_by,
    },
  }));

  const total = count || 0;
  return {
    expenses: mapped,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}


async function getDashboardActivity(
  input: DashboardActivityReadInput
): Promise<DashboardActivityPayload> {
  const supabase = requireSupabase();
  const activities: any[] = [];

  // Step 1: Get expense IDs for this user
  const { data: links, error: linksError } = await supabase
    .from("expense_participants")
    .select("expense_id")
    .eq("user_id", input.userId);
  if (linksError) throw linksError;
  const expenseIds = Array.from(new Set((links || []).map((row: any) => row.expense_id)));

  // Step 2: Batch fetch all activity data in parallel
  const [expensesResult, settlementsResult, friendshipsResult] = await Promise.all([
    // Get recent expenses
    supabase
      .from("expenses")
      .select("*")
      .in("id", expenseIds.length ? expenseIds : ["__none__"])
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(12),
    // Get recent settlements
    supabase
      .from("settlements")
      .select("*")
      .or(`from_user_id.eq.${input.userId},to_user_id.eq.${input.userId}`)
      .order("created_at", { ascending: false })
      .limit(8),
    // Get recent friendships
    supabase
      .from("friendships")
      .select("id,friend_id,created_at")
      .eq("user_id", input.userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(3)
  ]);

  if (expensesResult.error) throw expensesResult.error;
  if (settlementsResult.error) throw settlementsResult.error;
  if (friendshipsResult.error) throw friendshipsResult.error;

  const expenses = expensesResult.data || [];
  const settlements = settlementsResult.data || [];
  const friendships = friendshipsResult.data || [];

  // Step 3: Fetch all users and groups in a single batch
  const allUserIds = Array.from(new Set([
    ...expenses.map((row: any) => row.created_by),
    ...settlements.map((row: any) => row.from_user_id),
    ...settlements.map((row: any) => row.to_user_id),
    ...friendships.map((row: any) => row.friend_id)
  ]));

  const allGroupIds = expenses
    .map((row: any) => row.group_id)
    .filter(Boolean);

  const [usersResult, groupsResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", allUserIds),
    allGroupIds.length > 0
      ? supabase.from("groups").select("id,name,image").in("id", allGroupIds)
      : Promise.resolve({ data: [] })
  ]);

  if (usersResult.error) throw usersResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const usersMap = new Map((usersResult.data || []).map((row: any) => [row.id, row]));
  const groupsMap = new Map((groupsResult.data || []).map((row: any) => [row.id, row]));

  // Process expenses
  for (const expense of expenses) {
    const creator = mapUser(usersMap.get(expense.created_by));
    const group = mapGroup(groupsMap.get(expense.group_id));
    activities.push({
      id: expense.id,
      type: "expense_added",
      expenseType: group ? "group" : "non-group",
      description: group
        ? `${creator?.name || "Someone"} added "${expense.description}" in ${group.name}`
        : `${creator?.name || "Someone"} added "${expense.description}" with friends`,
      amount: Number(expense.amount),
      currency: expense.currency,
      createdAt: expense.created_at,
      user: creator
        ? {
            id: creator._id,
            name: creator.name,
            profilePicture: creator.profilePicture,
          }
        : null,
      group: group
        ? {
            id: group._id,
            name: group.name,
          }
        : null,
    });
  }

  // Process settlements
  for (const settlement of settlements) {
    const fromUser = mapUser(usersMap.get(settlement.from_user_id));
    const toUser = mapUser(usersMap.get(settlement.to_user_id));
    const isFromUser = settlement.from_user_id === input.userId;
    const otherUser = isFromUser ? toUser : fromUser;
    const action = isFromUser ? "paid" : "received payment from";

    activities.push({
      id: settlement.id,
      type: "settlement",
      description: `You ${action} ${otherUser?.name || "Unknown"}`,
      amount: Number(settlement.amount),
      currency: settlement.currency,
      createdAt: settlement.created_at,
      user: otherUser
        ? {
            id: otherUser._id,
            name: otherUser.name,
            profilePicture: otherUser.profilePicture,
          }
        : null,
    });
  }

  // Process friendships
  for (const friendship of friendships) {
    const friend = mapUser(usersMap.get(friendship.friend_id));
    activities.push({
      id: friendship.id,
      type: "friend_added",
      description: `You became friends with ${friend?.name || "Unknown"}`,
      createdAt: friendship.created_at,
      user: friend
        ? {
            id: friend._id,
            name: friend.name,
            profilePicture: friend.profilePicture,
          }
        : null,
    });
  }

  activities.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    activities: activities.slice(0, 20),
  };
}

async function getActivities(input: ActivitiesReadInput): Promise<ActivitiesPayload> {
  const supabase = requireSupabase();
  const fetchLimit = Math.min(200, input.page * input.limit + input.limit);

  const { data: links, error: linksError } = await supabase
    .from("expense_participants")
    .select("expense_id")
    .eq("user_id", input.userId);
  if (linksError) throw linksError;

  const expenseIds = Array.from(new Set((links || []).map((row: any) => row.expense_id)));
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("*")
    .in("id", expenseIds.length ? expenseIds : ["__none__"])
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (expensesError) throw expensesError;

  const { data: participants, error: participantsError } = await supabase
    .from("expense_participants")
    .select("*")
    .in(
      "expense_id",
      (expenses || []).map((row: any) => row.id).length
        ? (expenses || []).map((row: any) => row.id)
        : ["__none__"]
    );
  if (participantsError) throw participantsError;

  const { data: settlements, error: settlementsError } = await supabase
    .from("settlements")
    .select("*")
    .or(`from_user_id.eq.${input.userId},to_user_id.eq.${input.userId}`)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (settlementsError) throw settlementsError;

  const { data: friendRequests, error: friendRequestError } = await supabase
    .from("friendships")
    .select("*")
    .or(`and(user_id.eq.${input.userId},status.eq.pending),and(friend_id.eq.${input.userId},status.eq.pending)`)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (friendRequestError) throw friendRequestError;

  const users = await fetchUsersByIds([
    ...(expenses || []).map((row: any) => row.created_by),
    ...(participants || []).map((row: any) => row.user_id),
    ...(settlements || []).map((row: any) => row.from_user_id),
    ...(settlements || []).map((row: any) => row.to_user_id),
    ...(friendRequests || []).map((row: any) => row.user_id),
    ...(friendRequests || []).map((row: any) => row.friend_id),
  ]);
  const groups = await fetchGroupsByIds([
    ...(expenses || []).map((row: any) => row.group_id),
    ...(settlements || []).map((row: any) => row.group_id),
  ]);

  const participantsByExpense = new Map<string, any[]>();
  for (const participant of participants || []) {
    const key = participant.expense_id;
    const list = participantsByExpense.get(key) || [];
    list.push({
      _id: participant.id,
      expenseId: participant.expense_id,
      userId: mapUser(users.get(participant.user_id)),
      paidAmount: Number(participant.paid_amount || 0),
      owedAmount: Number(participant.owed_amount || 0),
      isSettled: !!participant.is_settled,
      createdAt: participant.created_at,
      updatedAt: participant.updated_at,
    });
    participantsByExpense.set(key, list);
  }

  const activities: any[] = [];

  for (const expense of expenses || []) {
    activities.push({
      type: "expense",
      id: expense.id,
      timestamp: expense.created_at,
      data: {
        _id: expense.id,
        amount: Number(expense.amount),
        description: expense.description,
        category: expense.category,
        date: expense.date,
        currency: expense.currency,
        createdBy: mapUser(users.get(expense.created_by)),
        groupId: mapGroup(groups.get(expense.group_id)),
        images: Array.isArray(expense.images) ? expense.images : [],
        notes: expense.notes,
        isDeleted: !!expense.is_deleted,
        editHistory: Array.isArray(expense.edit_history) ? expense.edit_history : [],
        createdAt: expense.created_at,
        updatedAt: expense.updated_at,
        participants: participantsByExpense.get(expense.id) || [],
      },
    });
  }

  for (const settlement of settlements || []) {
    activities.push({
      type: "settlement",
      id: settlement.id,
      timestamp: settlement.created_at,
      data: {
        _id: settlement.id,
        fromUserId: mapUser(users.get(settlement.from_user_id)),
        toUserId: mapUser(users.get(settlement.to_user_id)),
        amount: Number(settlement.amount),
        currency: settlement.currency,
        method: settlement.method,
        note: settlement.note,
        screenshot: settlement.screenshot,
        date: settlement.date,
        groupId: mapGroup(groups.get(settlement.group_id)),
        createdAt: settlement.created_at,
        updatedAt: settlement.updated_at,
      },
    });
  }

  for (const request of friendRequests || []) {
    activities.push({
      type: "friend_request",
      id: request.id,
      timestamp: request.created_at,
      data: {
        _id: request.id,
        userId: mapUser(users.get(request.user_id)),
        friendId: mapUser(users.get(request.friend_id)),
        status: request.status,
        requestedBy: request.requested_by,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      },
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const skip = (input.page - 1) * input.limit;
  const paginated = activities.slice(skip, skip + input.limit);
  return {
    activities: paginated,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: activities.length,
      totalPages: Math.ceil(activities.length / input.limit),
    },
  };
}

async function getSettlements(input: SettlementsReadInput): Promise<SettlementsPayload> {
  const supabase = requireSupabase();

  // Build optimized query with filters
  let baseQuery = supabase.from("settlements").select("*", { count: "exact" });
  if (input.friendId) {
    baseQuery = baseQuery.or(
      `and(from_user_id.eq.${input.userId},to_user_id.eq.${input.friendId}),and(from_user_id.eq.${input.friendId},to_user_id.eq.${input.userId})`
    );
  } else {
    baseQuery = baseQuery.or(`from_user_id.eq.${input.userId},to_user_id.eq.${input.userId}`);
  }

  if (input.groupId) {
    baseQuery = baseQuery.eq("group_id", input.groupId);
  }

  const skip = (input.page - 1) * input.limit;
  const { data: settlements, count, error } = await baseQuery
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(skip, skip + input.limit - 1);
  if (error) throw error;

  if (!settlements || settlements.length === 0) {
    return {
      settlements: [],
      pagination: {
        page: input.page,
        limit: input.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / input.limit),
      },
    };
  }

  // Batch fetch all users and groups in parallel
  const allUserIds = Array.from(new Set([
    ...settlements.map((row: any) => row.from_user_id),
    ...settlements.map((row: any) => row.to_user_id)
  ]));

  const allGroupIds = settlements
    .map((row: any) => row.group_id)
    .filter(Boolean);

  const [usersResult, groupsResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .in("id", allUserIds),
    allGroupIds.length > 0
      ? supabase.from("groups").select("id,name,image").in("id", allGroupIds)
      : Promise.resolve({ data: [] })
  ]);

  if (usersResult.error) throw usersResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const usersMap = new Map((usersResult.data || []).map((row: any) => [row.id, row]));
  const groupsMap = new Map((groupsResult.data || []).map((row: any) => [row.id, row]));

  const mapped = settlements.map((settlement: any) => ({
    _id: settlement.id,
    fromUserId: mapUser(usersMap.get(settlement.from_user_id)),
    toUserId: mapUser(usersMap.get(settlement.to_user_id)),
    amount: Number(settlement.amount),
    currency: settlement.currency,
    method: settlement.method,
    note: settlement.note,
    screenshot: settlement.screenshot,
    date: settlement.date,
    groupId: mapGroup(groupsMap.get(settlement.group_id)),
    version: settlement.version || 1,
    lastModified: settlement.last_modified || settlement.updated_at,
    modifiedBy: settlement.modified_by,
    createdAt: settlement.created_at,
    updatedAt: settlement.updated_at,
    _version: {
      version: settlement.version || 1,
      lastModified: settlement.last_modified || settlement.updated_at,
      modifiedBy: settlement.modified_by || settlement.from_user_id,
    },
  }));

  const total = count || 0;
  return {
    settlements: mapped,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export const supabaseReadRepository: ReadRepository = {
  getFriends,
  getGroups,
  getExpenses,
  getDashboardActivity,
  getActivities,
  getSettlements,
};

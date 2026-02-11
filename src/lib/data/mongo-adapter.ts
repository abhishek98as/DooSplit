import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Expense from "@/models/Expense";
import ExpenseParticipant from "@/models/ExpenseParticipant";
import Friend from "@/models/Friend";
import Group from "@/models/Group";
import GroupMember from "@/models/GroupMember";
import Settlement from "@/models/Settlement";
import { getUserBalances } from "@/lib/balanceCalculator";
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

async function getFriends(input: FriendsReadInput): Promise<FriendsPayload> {
  await dbConnect();
  const currentUserId = new mongoose.Types.ObjectId(input.userId);

  const friendships = await Friend.find({
    $or: [{ userId: currentUserId }, { friendId: currentUserId }],
    status: "accepted",
  })
    .populate("userId friendId", "name email profilePicture isDummy")
    .lean();

  const balances = await getUserBalances(currentUserId);
  const uniqueFriends = new Map<string, any>();

  for (const friendship of friendships as any[]) {
    const friendData =
      friendship.userId._id.toString() === input.userId
        ? friendship.friendId
        : friendship.userId;

    const friendId = friendData._id.toString();
    if (uniqueFriends.has(friendId)) {
      continue;
    }

    uniqueFriends.set(friendId, {
      id: friendship._id,
      friend: {
        id: friendData._id,
        name: friendData.name,
        email: friendData.email,
        profilePicture: friendData.profilePicture,
        isDummy: friendData.isDummy || false,
      },
      balance: balances.get(friendId) || 0,
      friendshipDate: friendship.createdAt,
    });
  }

  return { friends: Array.from(uniqueFriends.values()) };
}

async function getGroups(input: GroupsReadInput): Promise<GroupsPayload> {
  await dbConnect();
  const userId = new mongoose.Types.ObjectId(input.userId);

  const memberRecords = await GroupMember.find({ userId })
    .select("groupId role")
    .lean();
  const groupIds = memberRecords.map((m: any) => m.groupId);

  if (groupIds.length === 0) {
    return { groups: [] };
  }

  const groups = await Group.find({
    _id: { $in: groupIds },
    isActive: true,
  })
    .populate("createdBy", "name email profilePicture")
    .sort({ createdAt: -1 })
    .lean();

  const members = await GroupMember.find({
    groupId: { $in: groups.map((group) => group._id) },
  })
    .populate("userId", "name email profilePicture")
    .lean();

  const membersByGroup = new Map<string, any[]>();
  for (const member of members as any[]) {
    const key = member.groupId.toString();
    const list = membersByGroup.get(key) || [];
    list.push(member);
    membersByGroup.set(key, list);
  }

  const roleByGroup = new Map(
    memberRecords.map((member: any) => [member.groupId.toString(), member.role])
  );

  const groupsWithDetails = groups.map((group: any) => {
    const groupMembers = membersByGroup.get(group._id.toString()) || [];

    return {
      ...group,
      memberCount: groupMembers.length,
      members: groupMembers,
      userRole: roleByGroup.get(group._id.toString()) || "member",
    };
  });

  return { groups: groupsWithDetails };
}

async function getExpenses(input: ExpensesReadInput): Promise<ExpensesPayload> {
  await dbConnect();
  const userId = new mongoose.Types.ObjectId(input.userId);
  const expenseIds = await ExpenseParticipant.find({ userId }).distinct("expenseId");

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

  const query: any = {
    _id: { $in: expenseIds },
    isDeleted: false,
  };

  if (input.category) query.category = input.category;
  if (input.groupId) query.groupId = new mongoose.Types.ObjectId(input.groupId);
  if (input.startDate || input.endDate) {
    query.date = {};
    if (input.startDate) query.date.$gte = new Date(input.startDate);
    if (input.endDate) query.date.$lte = new Date(input.endDate);
  }

  const skip = (input.page - 1) * input.limit;

  const expenses = await Expense.find(query)
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(input.limit)
    .populate("createdBy", "name email profilePicture")
    .populate("groupId", "name image")
    .lean();

  const total = await Expense.countDocuments(query);
  const expenseIdsOnPage = expenses.map((expense) => expense._id);

  const allParticipants = await ExpenseParticipant.find({
    expenseId: { $in: expenseIdsOnPage },
  })
    .populate("userId", "name email profilePicture")
    .lean();

  const participantsByExpense = new Map<string, any[]>();
  for (const participant of allParticipants as any[]) {
    const key = participant.expenseId.toString();
    const list = participantsByExpense.get(key) || [];
    list.push(participant);
    participantsByExpense.set(key, list);
  }

  const expensesWithParticipants = expenses.map((expense: any) => ({
    ...expense,
    participants: participantsByExpense.get(expense._id.toString()) || [],
    _version: {
      version: 1,
      lastModified: expense.updatedAt,
      modifiedBy: expense.createdBy,
    },
  }));

  return {
    expenses: expensesWithParticipants,
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
  await dbConnect();
  const userId = new mongoose.Types.ObjectId(input.userId);
  const activities: any[] = [];

  const expenseIds = await ExpenseParticipant.find({ userId }).distinct("expenseId");
  const expenses = await Expense.find({
    _id: { $in: expenseIds },
    isDeleted: false,
  })
    .populate("createdBy", "name profilePicture")
    .populate("groupId", "name")
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

  expenses.forEach((expense: any) => {
    const expenseType = expense.groupId ? "group" : "non-group";
    activities.push({
      id: expense._id,
      type: "expense_added",
      expenseType,
      description: expense.groupId
        ? `${expense.createdBy.name} added "${expense.description}" in ${expense.groupId.name}`
        : `${expense.createdBy.name} added "${expense.description}" with friends`,
      amount: expense.amount,
      currency: expense.currency,
      createdAt: expense.createdAt,
      user: {
        id: expense.createdBy._id,
        name: expense.createdBy.name,
        profilePicture: expense.createdBy.profilePicture,
      },
      group: expense.groupId
        ? {
            id: expense.groupId._id,
            name: expense.groupId.name,
          }
        : null,
    });
  });

  const settlements = await Settlement.find({
    $or: [{ fromUserId: userId }, { toUserId: userId }],
  })
    .populate("fromUserId", "name profilePicture")
    .populate("toUserId", "name profilePicture")
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  settlements.forEach((settlement: any) => {
    const isFromUser = settlement.fromUserId._id.toString() === input.userId;
    const otherUser = isFromUser ? settlement.toUserId : settlement.fromUserId;
    const action = isFromUser ? "paid" : "received payment from";

    activities.push({
      id: settlement._id,
      type: "settlement",
      description: `You ${action} ${otherUser.name}`,
      amount: settlement.amount,
      currency: settlement.currency,
      createdAt: settlement.createdAt,
      user: {
        id: otherUser._id,
        name: otherUser.name,
        profilePicture: otherUser.profilePicture,
      },
    });
  });

  const friends = await Friend.find({
    $or: [{ userId }, { friendId: userId }],
    status: "accepted",
  })
    .populate("userId", "name profilePicture")
    .populate("friendId", "name profilePicture")
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  friends.forEach((friend: any) => {
    const otherUser =
      friend.userId._id.toString() === input.userId ? friend.friendId : friend.userId;

    activities.push({
      id: friend._id,
      type: "friend_added",
      description: `You became friends with ${otherUser.name}`,
      createdAt: friend.createdAt,
      user: {
        id: otherUser._id,
        name: otherUser.name,
        profilePicture: otherUser.profilePicture,
      },
    });
  });

  activities.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return { activities: activities.slice(0, 20) };
}

async function getActivities(input: ActivitiesReadInput): Promise<ActivitiesPayload> {
  await dbConnect();
  const userId = new mongoose.Types.ObjectId(input.userId);
  const fetchLimit = Math.min(200, input.page * input.limit + input.limit);

  const expenseIds = await ExpenseParticipant.find({ userId }).distinct("expenseId");

  const expenses = await Expense.find({
    _id: { $in: expenseIds },
    isDeleted: false,
  })
    .populate("createdBy", "name email profilePicture")
    .populate("groupId", "name image")
    .sort({ createdAt: -1 })
    .limit(fetchLimit)
    .lean();

  const participants = await ExpenseParticipant.find({
    expenseId: { $in: expenses.map((expense) => expense._id) },
  })
    .populate("userId", "name email profilePicture")
    .lean();

  const participantsByExpense = new Map<string, any[]>();
  for (const participant of participants as any[]) {
    const key = participant.expenseId.toString();
    const list = participantsByExpense.get(key) || [];
    list.push(participant);
    participantsByExpense.set(key, list);
  }

  const settlements = await Settlement.find({
    $or: [{ fromUserId: userId }, { toUserId: userId }],
  })
    .populate("fromUserId", "name email profilePicture")
    .populate("toUserId", "name email profilePicture")
    .populate("groupId", "name image")
    .sort({ createdAt: -1 })
    .limit(fetchLimit)
    .lean();

  const friendRequests = await Friend.find({
    $or: [
      { userId, status: "pending" },
      { friendId: userId, status: "pending" },
    ],
  })
    .populate("userId", "name email profilePicture")
    .populate("friendId", "name email profilePicture")
    .sort({ createdAt: -1 })
    .limit(fetchLimit)
    .lean();

  const activities: any[] = [];
  for (const expense of expenses as any[]) {
    activities.push({
      type: "expense",
      id: expense._id,
      timestamp: expense.createdAt,
      data: {
        ...expense,
        participants: participantsByExpense.get(expense._id.toString()) || [],
      },
    });
  }
  for (const settlement of settlements as any[]) {
    activities.push({
      type: "settlement",
      id: settlement._id,
      timestamp: settlement.createdAt,
      data: settlement,
    });
  }
  for (const friendRequest of friendRequests as any[]) {
    activities.push({
      type: "friend_request",
      id: friendRequest._id,
      timestamp: friendRequest.createdAt,
      data: friendRequest,
    });
  }

  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const skip = (input.page - 1) * input.limit;
  const paginatedActivities = activities.slice(skip, skip + input.limit);

  return {
    activities: paginatedActivities,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: activities.length,
      totalPages: Math.ceil(activities.length / input.limit),
    },
  };
}

async function getSettlements(input: SettlementsReadInput): Promise<SettlementsPayload> {
  await dbConnect();
  const userId = new mongoose.Types.ObjectId(input.userId);
  const query: any = {
    $or: [{ fromUserId: userId }, { toUserId: userId }],
  };

  if (input.groupId) query.groupId = new mongoose.Types.ObjectId(input.groupId);
  if (input.friendId) {
    const friendObjectId = new mongoose.Types.ObjectId(input.friendId);
    query.$or = [
      { fromUserId: userId, toUserId: friendObjectId },
      { fromUserId: friendObjectId, toUserId: userId },
    ];
  }

  const skip = (input.page - 1) * input.limit;
  const settlements = await Settlement.find(query)
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(input.limit)
    .populate("fromUserId", "name email profilePicture")
    .populate("toUserId", "name email profilePicture")
    .populate("groupId", "name image")
    .lean();

  const total = await Settlement.countDocuments(query);
  const settlementsWithVersions = settlements.map((settlement: any) => ({
    ...settlement,
    _version: {
      version: settlement.version || 1,
      lastModified: settlement.lastModified || settlement.updatedAt,
      modifiedBy: settlement.modifiedBy || settlement.fromUserId,
    },
  }));

  return {
    settlements: settlementsWithVersions,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export const mongoReadRepository: ReadRepository = {
  getFriends,
  getGroups,
  getExpenses,
  getDashboardActivity,
  getActivities,
  getSettlements,
};

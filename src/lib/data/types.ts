export interface FriendsPayload {
  friends: any[];
}

export interface GroupsPayload {
  groups: any[];
}

export interface ExpensesPayload {
  expenses: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardActivityPayload {
  activities: any[];
}

export interface ActivitiesPayload {
  activities: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SettlementsPayload {
  settlements: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ReadPayload =
  | FriendsPayload
  | GroupsPayload
  | ExpensesPayload
  | DashboardActivityPayload
  | ActivitiesPayload
  | SettlementsPayload;

export interface ShadowDiffLog {
  routeName: string;
  userId: string;
  requestKey: string;
  mongoCount?: number;
  backendCount?: number;
  details?: string;
}

export interface FriendsReadInput {
  userId: string;
  requestSearch: string;
}

export interface GroupsReadInput {
  userId: string;
  requestSearch: string;
}

export interface ExpensesReadInput {
  userId: string;
  page: number;
  limit: number;
  category?: string | null;
  groupId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface DashboardActivityReadInput {
  userId: string;
}

export interface ActivitiesReadInput {
  userId: string;
  page: number;
  limit: number;
}

export interface SettlementsReadInput {
  userId: string;
  page: number;
  limit: number;
  groupId?: string | null;
  friendId?: string | null;
}

export interface ReadRepository {
  getFriends(input: FriendsReadInput): Promise<FriendsPayload>;
  getGroups(input: GroupsReadInput): Promise<GroupsPayload>;
  getExpenses(input: ExpensesReadInput): Promise<ExpensesPayload>;
  getDashboardActivity(
    input: DashboardActivityReadInput
  ): Promise<DashboardActivityPayload>;
  getActivities(input: ActivitiesReadInput): Promise<ActivitiesPayload>;
  getSettlements(input: SettlementsReadInput): Promise<SettlementsPayload>;
}

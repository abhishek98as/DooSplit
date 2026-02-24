export const EXPENSE_MUTATION_CACHE_SCOPES = [
  "expenses",
  "friends",
  "groups",
  "activities",
  "dashboard-activity",
  "friend-transactions",
  "friend-details",
  "user-balance",
  "analytics",
] as const;

export const SETTLEMENT_MUTATION_CACHE_SCOPES = [
  "settlements",
  "expenses",
  "friends",
  "groups",
  "activities",
  "dashboard-activity",
  "friend-transactions",
  "friend-details",
  "user-balance",
  "analytics",
] as const;

export const FRIEND_MUTATION_CACHE_SCOPES = [
  "friends",
  "groups",
  "activities",
  "dashboard-activity",
  "friend-transactions",
  "friend-details",
  "user-balance",
  "settlements",
  "analytics",
] as const;

export const GROUP_MUTATION_CACHE_SCOPES = [
  "groups",
  "expenses",
  "activities",
  "dashboard-activity",
  "friend-details",
  "user-balance",
  "analytics",
] as const;

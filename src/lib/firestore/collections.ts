export const COLLECTIONS = {
  users: "users",
  friendships: "friendships",
  groups: "groups",
  groupMembers: "group_members",
  expenses: "expenses",
  expenseParticipants: "expense_participants",
  expenseComments: "expense_comments",
  recurringExpenseTemplates: "recurring_expense_templates",
  recurringExpenseRuns: "recurring_expense_runs",
  settlements: "settlements",
  settlementAllocations: "settlement_allocations",
  featureFeedback: "feature_feedback",
  notifications: "notifications",
  invitations: "invitations",
  paymentReminders: "payment_reminders",
  userNudgeStates: "user_nudge_states",
  notes: "notes",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

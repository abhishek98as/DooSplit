export const COLLECTIONS = {
  users: "users",
  friendships: "friendships",
  groups: "groups",
  groupMembers: "group_members",
  expenses: "expenses",
  expenseParticipants: "expense_participants",
  expenseComments: "expense_comments",
  settlements: "settlements",
  featureFeedback: "feature_feedback",
  notifications: "notifications",
  invitations: "invitations",
  paymentReminders: "payment_reminders",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

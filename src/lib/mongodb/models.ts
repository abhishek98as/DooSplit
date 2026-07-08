// DynamoDB-only — re-export from DynamoDB entities for API route compatibility
export { getUserById as User_findById, getUserByEmail, getUsersByIds, putUser, queryUsers } from "@/lib/dynamodb/entities/users";
export { getGroupById, listGroupsForUser, listGroupMembers, putGroup, putGroupMember, deleteGroupMember } from "@/lib/dynamodb/entities/groups";
export { getExpenseById, listExpensesForUser, queryExpenseParticipants, putExpense, putExpenseParticipant } from "@/lib/dynamodb/entities/expenses";
export { getSettlementById, listSettlementsForUser, putSettlement } from "@/lib/dynamodb/entities/settlements";
export { getFriendship, listFriendshipsForUser, putFriendship } from "@/lib/dynamodb/entities/friendships";
export { putNotification, queryNotificationsForUser } from "@/lib/dynamodb/entities/notifications";
export { listInvitationsForUser, putInvitation, getInvitationByToken } from "@/lib/dynamodb/entities/invitations";
export { putActivity } from "@/lib/dynamodb/entities/activities";
export { queryPaymentReminders, putPaymentReminder, deletePaymentReminder } from "@/lib/dynamodb/entities/reminders";
export { getRecurringTemplate, listRecurringTemplatesForUser, putRecurringTemplate, putRecurringRun } from "@/lib/dynamodb/entities/recurring";

// Stub models — throw if code tries to use Mongoose methods
function createStubModel(name: string): any {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === "find" || prop === "findOne" || prop === "findById" || prop === "create" ||
          prop === "findOneAndUpdate" || prop === "findOneAndDelete" || prop === "findByIdAndUpdate") {
        return () => { throw new Error(`Mongoose ${name}.${String(prop)}() removed. Use DynamoDB entity instead.`); };
      }
      return undefined;
    }
  });
}

export const User = createStubModel("User");
export const Expense = createStubModel("Expense");
export const ExpenseParticipant = createStubModel("ExpenseParticipant");
export const ExpenseComment = createStubModel("ExpenseComment");
export const Group = createStubModel("Group");
export const GroupMember = createStubModel("GroupMember");
export const Settlement = createStubModel("Settlement");
export const SettlementAllocation = createStubModel("SettlementAllocation");
export const Friendship = createStubModel("Friendship");
export const Invitation = createStubModel("Invitation");
export const Notification = createStubModel("Notification");
export const ActivityLog = createStubModel("ActivityLog");
export const PaymentReminder = createStubModel("PaymentReminder");
export const RecurringExpenseTemplate = createStubModel("RecurringExpenseTemplate");
export const RecurringExpenseRun = createStubModel("RecurringExpenseRun");
export const FeatureFeedback = createStubModel("FeatureFeedback");
export const UserNudgeState = createStubModel("UserNudgeState");
export const Note = createStubModel("Note");

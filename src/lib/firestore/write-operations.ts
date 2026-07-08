// DynamoDB-only — re-export from DynamoDB write-operations
export {
  createExpense as createExpenseInFirestore,
  createGroup as createGroupInFirestore,
  createSettlement as createSettlementInFirestore,
} from "@/lib/dynamodb/write-operations";

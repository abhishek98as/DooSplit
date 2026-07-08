// DynamoDB-only — re-export from DynamoDB write-operations
import { createExpenseInDynamo, createGroupInDynamo, createSettlementInDynamo } from "@/lib/dynamodb/write-operations";

export const createExpenseInFirestore = createExpenseInDynamo;
export const createGroupInFirestore = createGroupInDynamo;
export const createSettlementInFirestore = createSettlementInDynamo;

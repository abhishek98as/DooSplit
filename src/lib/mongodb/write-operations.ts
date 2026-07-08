import { createExpenseInDynamo, createGroupInDynamo, createSettlementInDynamo } from "@/lib/dynamodb/write-operations";

export const createExpense = createExpenseInDynamo;
export const createGroup = createGroupInDynamo;
export const createSettlement = createSettlementInDynamo;
export const createExpenseInMongo = createExpenseInDynamo;

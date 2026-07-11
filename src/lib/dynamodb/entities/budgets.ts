import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";

export interface UserBudgetEntry {
  monthly: number;
  currency: string;
}

export interface UserBudgetsRecord {
  userId: string;
  budgets: Record<string, UserBudgetEntry>;
  updatedAt: string;
}

function budgetKey(userId: string) {
  return { PK: `USER#${userId}`, SK: "BUDGET" };
}

export async function getUserBudgets(userId: string): Promise<UserBudgetsRecord | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: budgetKey(userId) })
  );
  if (!res.Item) return null;
  const item = res.Item as any;
  return {
    userId: item.userId || userId,
    budgets: item.budgets || {},
    updatedAt: item.updatedAt || "",
  };
}

export async function putUserBudgets(record: UserBudgetsRecord): Promise<void> {
  const now = new Date().toISOString();
  await getDynamoDB().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...budgetKey(record.userId),
        entityType: "user_budget",
        userId: record.userId,
        budgets: record.budgets,
        updatedAt: record.updatedAt || now,
      },
    })
  );
}

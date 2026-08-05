/**
 * User budgets stored under USER#{userId} / BUDGETS
 */
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK } from "../keys";

export type BudgetEntry = { monthly: number; currency: string };
export type UserBudgets = Record<string, BudgetEntry>;

const BUDGETS_SK = "BUDGETS";

export async function getUserBudgets(userId: string): Promise<UserBudgets> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: BUDGETS_SK },
    })
  );
  const item = res.Item as { budgets?: UserBudgets } | undefined;
  return item?.budgets || {};
}

export async function putUserBudgets(
  userId: string,
  budgets: UserBudgets
): Promise<void> {
  const now = new Date().toISOString();
  await getDynamoDB().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: PK.user(userId),
        SK: BUDGETS_SK,
        entityType: "user_budgets",
        user_id: userId,
        budgets,
        updated_at: now,
        created_at: now,
      },
    })
  );
}

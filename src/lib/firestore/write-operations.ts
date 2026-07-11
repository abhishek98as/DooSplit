// DynamoDB-only — re-export from DynamoDB write-operations
import { createExpenseInDynamo, createGroupInDynamo, createSettlementInDynamo } from "@/lib/dynamodb/write-operations";
import { newAppId } from "@/lib/ids";

export async function createExpenseInFirestore(expenseData: any, participants: any[]) {
  const id = newAppId();
  const now = new Date().toISOString();
  await createExpenseInDynamo({
    expense: {
      id,
      amount: Number(expenseData.amount || 0),
      description: String(expenseData.description || ""),
      category: expenseData.category || "other",
      date: expenseData.date || now,
      currency: expenseData.currency || "INR",
      created_by: expenseData.created_by || "",
      group_id: expenseData.group_id || undefined,
      notes: expenseData.notes || "",
      split_type: expenseData.split_method || "equally",
      is_deleted: false,
      is_settled: false,
      created_at: now,
      updated_at: now,
    },
    participants: participants.map((p: any) => ({
      expense_id: id,
      user_id: String(p.user_id || ""),
      amount_owed: Number(p.owed_amount || 0),
      amount_paid: Number(p.paid_amount || 0),
      is_excluded: false,
      is_settled: false,
      expense_date: expenseData.date || now,
      expense_group_id: expenseData.group_id || undefined,
      created_at: now,
      updated_at: now,
    })),
  });
  return id;
}

export const createGroupInFirestore = async (groupData: any) => {
  const id = newAppId();
  const now = new Date().toISOString();
  const memberIds: string[] = groupData.members || [];
  await createGroupInDynamo({
    group: {
      id,
      name: String(groupData.name || "").trim(),
      description: groupData.description || "",
      created_by: groupData.created_by || "",
      currency: groupData.currency || "INR",
      is_active: true,
      member_count: memberIds.length + 1,
      created_at: now,
      updated_at: now,
    },
    members: memberIds.map((userId: string) => ({
      group_id: id,
      user_id: userId,
      role: userId === groupData.created_by ? "admin" : "member",
      status: "active",
      joined_at: now,
      created_at: now,
      updated_at: now,
    })),
  });
  return id;
};

export const createSettlementInFirestore = async (settlementData: any) => {
  const id = newAppId();
  const now = new Date().toISOString();
  await createSettlementInDynamo({
    settlement: { id, ...settlementData, created_at: now, updated_at: now },
    allocations: settlementData.allocations || [],
  });
  return id;
};

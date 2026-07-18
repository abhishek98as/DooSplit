import { createExpenseInDynamo, createGroupInDynamo, createSettlementInDynamo } from "@/lib/dynamodb/write-operations";
import { newAppId } from "@/lib/ids";

export async function createExpense(expenseData: any, participants: any[]) {
  const id = newAppId();
  const now = new Date().toISOString();
  await createExpenseInDynamo({
    expense: {
      id, amount: Number(expenseData.amount || 0),
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
      payment_status: expenseData.payment_status || "unpaid",
      payment_status_updated_at: expenseData.payment_status_updated_at || now,
      payment_status_updated_by: expenseData.payment_status_updated_by || expenseData.created_by || "",
      edit_history: expenseData.edit_history || [],
      receipt_images: Array.isArray(expenseData.images) ? expenseData.images : [],
      created_at: now,
      updated_at: now,
    },
    participants: participants.map((p: any) => ({
      expense_id: id, user_id: String(p.user_id || ""),
      amount_owed: Number(p.owed_amount || 0),
      amount_paid: Number(p.paid_amount || 0),
      is_excluded: false, is_settled: false,
      expense_date: expenseData.date || now,
      expense_group_id: expenseData.group_id || undefined,
      created_at: now, updated_at: now,
    })),
  });
  return id;
}

export const createExpenseInMongo = createExpense;
export const createGroup = async (data: any) => {
  const id = newAppId();
  const now = new Date().toISOString();
  const memberIds: string[] = data.members || [];
  await createGroupInDynamo({
    group: { id, name: String(data.name || "").trim(), description: data.description || "", created_by: data.created_by || "", currency: data.currency || "INR", is_active: true, member_count: memberIds.length + 1, created_at: now, updated_at: now },
    members: memberIds.map((userId: string) => ({ group_id: id, user_id: userId, role: userId === data.created_by ? "admin" : "member", status: "active", joined_at: now, created_at: now, updated_at: now })),
  });
  return id;
};
export const createSettlement = async (data: any) => { const id = newAppId(); await createSettlementInDynamo({ settlement: { id, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, allocations: data.allocations || [] }); return id; };

import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IExpenseComment {
  _id: string;
  expense_id: string;
  user_id: string;
  actor_name: string;
  content: string;
  mentions?: string[];
  created_at: Date;
  updated_at: Date;
}

const ExpenseCommentSchema = new Schema<IExpenseComment>(
  {
    _id: { type: String, required: true },
    expense_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    actor_name: { type: String, required: true },
    content: { type: String, required: true },
    mentions: { type: [String], default: [] },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.expenseComments,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Expense-scoped comment listing
ExpenseCommentSchema.index({ expense_id: 1, created_at: -1 });

export const ExpenseComment: Model<IExpenseComment> =
  (mongoose.models.ExpenseComment as Model<IExpenseComment>) ||
  mongoose.model<IExpenseComment>("ExpenseComment", ExpenseCommentSchema);

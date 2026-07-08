import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IExpenseParticipant {
  _id: string;
  expense_id: string;
  user_id: string;
  amount_owed: number;
  amount_paid: number;
  split_type: "equal" | "exact" | "percentage" | "share";
  is_excluded: boolean;
  is_settled: boolean;
  created_at: Date;
  updated_at: Date;
}

const ExpenseParticipantSchema = new Schema<IExpenseParticipant>(
  {
    _id: { type: String, required: true },
    expense_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    amount_owed: { type: Number, required: true },
    amount_paid: { type: Number, required: true },
    split_type: {
      type: String,
      enum: ["equal", "exact", "percentage", "share"],
      default: "equal",
    },
    is_excluded: { type: Boolean, default: false },
    is_settled: { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.expenseParticipants,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
ExpenseParticipantSchema.index({ user_id: 1, expense_id: 1 });
ExpenseParticipantSchema.index({ expense_id: 1, user_id: 1 });

export const ExpenseParticipant: Model<IExpenseParticipant> =
  (mongoose.models.ExpenseParticipant as Model<IExpenseParticipant>) ||
  mongoose.model<IExpenseParticipant>("ExpenseParticipant", ExpenseParticipantSchema);

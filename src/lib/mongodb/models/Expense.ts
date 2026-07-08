import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IExpense {
  _id: string;
  group_id?: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  time?: string;
  receipt_images: string[];
  notes?: string;
  split_method: "equally" | "exact" | "percentage" | "shares";
  payment_status: "unpaid" | "partially_paid" | "paid" | "disputed";
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    _id: { type: String, required: true },
    group_id: { type: String, index: true },
    created_by: { type: String, required: true, index: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    category: { type: String, default: "other" },
    date: { type: String, required: true },
    time: { type: String },
    receipt_images: { type: [String], default: [] },
    notes: { type: String },
    split_method: {
      type: String,
      enum: ["equally", "exact", "percentage", "shares"],
      default: "equally",
    },
    payment_status: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid", "disputed"],
      default: "unpaid",
    },
    is_deleted: { type: Boolean, default: false, index: true },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.expenses,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
ExpenseSchema.index({ created_by: 1, is_deleted: 1, date: -1 });
ExpenseSchema.index({ group_id: 1, is_deleted: 1, date: -1 });
ExpenseSchema.index({ created_by: 1, group_id: 1, date: -1 });

export const Expense: Model<IExpense> =
  (mongoose.models.Expense as Model<IExpense>) ||
  mongoose.model<IExpense>("Expense", ExpenseSchema);

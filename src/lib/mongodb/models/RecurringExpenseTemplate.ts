import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IRecurringExpenseTemplate {
  _id: string;
  owner_id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  frequency: "daily" | "weekly" | "monthly";
  interval?: number;
  next_run_date?: string;
  end_date?: string;
  participant_ids: string[];
  split_type: "equally" | "exact" | "percentage" | "shares";
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const RecurringExpenseTemplateSchema = new Schema<IRecurringExpenseTemplate>(
  {
    _id: { type: String, required: true },
    owner_id: { type: String, required: true, index: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    category: { type: String, default: "other" },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "monthly",
    },
    interval: { type: Number, default: 1 },
    next_run_date: { type: String },
    end_date: { type: String },
    participant_ids: { type: [String], default: [] },
    split_type: {
      type: String,
      enum: ["equally", "exact", "percentage", "shares"],
      default: "equally",
    },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.recurringExpenseTemplates,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore query patterns
RecurringExpenseTemplateSchema.index({ owner_id: 1 });
RecurringExpenseTemplateSchema.index({ participant_ids: 1 });
RecurringExpenseTemplateSchema.index({ is_active: 1, next_run_date: 1 });

export const RecurringExpenseTemplate: Model<IRecurringExpenseTemplate> =
  (mongoose.models.RecurringExpenseTemplate as Model<IRecurringExpenseTemplate>) ||
  mongoose.model<IRecurringExpenseTemplate>(
    "RecurringExpenseTemplate",
    RecurringExpenseTemplateSchema
  );

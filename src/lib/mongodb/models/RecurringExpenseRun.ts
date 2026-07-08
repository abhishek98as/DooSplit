import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IRecurringExpenseRun {
  _id: string;
  template_id: string;
  owner_id: string;
  created_expenses: string[];
  run_date: string;
  status: string;
  created_at: Date;
}

const RecurringExpenseRunSchema = new Schema<IRecurringExpenseRun>(
  {
    _id: { type: String, required: true },
    template_id: { type: String, required: true, index: true },
    owner_id: { type: String, required: true, index: true },
    created_expenses: { type: [String], default: [] },
    run_date: { type: String, required: true },
    status: { type: String, default: "completed" },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.recurringExpenseRuns,
    timestamps: { createdAt: "created_at" },
    versionKey: false,
  }
);

// Firestore-equivalent query patterns
RecurringExpenseRunSchema.index({ owner_id: 1, run_date: -1 });
RecurringExpenseRunSchema.index({ template_id: 1 });

export const RecurringExpenseRun: Model<IRecurringExpenseRun> =
  (mongoose.models.RecurringExpenseRun as Model<IRecurringExpenseRun>) ||
  mongoose.model<IRecurringExpenseRun>("RecurringExpenseRun", RecurringExpenseRunSchema);

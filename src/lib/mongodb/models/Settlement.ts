import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface ISettlement {
  _id: string;
  from_user_id: string;
  to_user_id: string;
  group_id?: string;
  amount: number;
  currency: string;
  method: string;
  note?: string;
  screenshot?: string;
  date: string;
  created_at: Date;
  updated_at: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    _id: { type: String, required: true },
    from_user_id: { type: String, required: true, index: true },
    to_user_id: { type: String, required: true, index: true },
    group_id: { type: String, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    method: { type: String, required: true },
    note: { type: String },
    screenshot: { type: String },
    date: { type: String, required: true },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.settlements,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
SettlementSchema.index({ from_user_id: 1, date: -1 });
SettlementSchema.index({ to_user_id: 1, date: -1 });
SettlementSchema.index({ group_id: 1, date: -1 });

export const Settlement: Model<ISettlement> =
  (mongoose.models.Settlement as Model<ISettlement>) ||
  mongoose.model<ISettlement>("Settlement", SettlementSchema);

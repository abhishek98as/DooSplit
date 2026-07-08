import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface ISettlementAllocation {
  _id: string;
  settlement_id: string;
  expense_id: string;
  from_user_id: string;
  to_user_id: string;
  allocated_amount: number;
  created_at: Date;
}

const SettlementAllocationSchema = new Schema<ISettlementAllocation>(
  {
    _id: { type: String, required: true },
    settlement_id: { type: String, required: true, index: true },
    expense_id: { type: String, required: true, index: true },
    from_user_id: { type: String, required: true },
    to_user_id: { type: String, required: true },
    allocated_amount: { type: Number, required: true },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.settlementAllocations,
    timestamps: true,
    versionKey: false,
  }
);

// Key query patterns
SettlementAllocationSchema.index({ settlement_id: 1 });
SettlementAllocationSchema.index({ expense_id: 1 });

export const SettlementAllocation: Model<ISettlementAllocation> =
  (mongoose.models.SettlementAllocation as Model<ISettlementAllocation>) ||
  mongoose.model<ISettlementAllocation>("SettlementAllocation", SettlementAllocationSchema);

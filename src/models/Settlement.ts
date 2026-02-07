import mongoose, { Schema, Model } from "mongoose";

export interface ISettlement {
  _id: mongoose.Types.ObjectId;
  fromUserId: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  method: string;
  note?: string;
  screenshot?: string;
  date: Date;
  groupId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    currency: {
      type: String,
      default: "INR",
      enum: ["INR", "USD", "EUR", "GBP", "AUD", "CAD"],
    },
    method: {
      type: String,
      required: true,
      enum: ["cash", "upi", "bank_transfer", "paytm", "gpay", "phonepe", "other"],
      default: "upi",
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
    },
    screenshot: {
      type: String,
      default: null,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
SettlementSchema.index({ fromUserId: 1, toUserId: 1 });
SettlementSchema.index({ fromUserId: 1, date: -1 });
SettlementSchema.index({ toUserId: 1, date: -1 });
SettlementSchema.index({ groupId: 1, date: -1 });
SettlementSchema.index({ date: -1 });

const Settlement: Model<ISettlement> =
  mongoose.models.Settlement ||
  mongoose.model<ISettlement>("Settlement", SettlementSchema);

export default Settlement;

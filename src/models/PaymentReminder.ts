import mongoose, { Schema, Model } from "mongoose";

export interface IPaymentReminder {
  _id: mongoose.Types.ObjectId;
  fromUserId: mongoose.Types.ObjectId; // User sending the reminder
  toUserId: mongoose.Types.ObjectId;   // User receiving the reminder
  amount: number;
  currency: string;
  message?: string;
  status: "pending" | "sent" | "read" | "paid";
  sentAt?: Date;
  readAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentReminderSchema = new Schema<IPaymentReminder>(
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
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    message: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "read", "paid"],
      default: "pending",
    },
    sentAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
PaymentReminderSchema.index({ fromUserId: 1, createdAt: -1 });
PaymentReminderSchema.index({ toUserId: 1, createdAt: -1 });
// Removed: { status: 1 } — low cardinality (4 values)

const PaymentReminder: Model<IPaymentReminder> =
  mongoose.models.PaymentReminder || mongoose.model<IPaymentReminder>("PaymentReminder", PaymentReminderSchema);

export default PaymentReminder;
import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IPaymentReminder {
  _id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  status: "sent" | "acknowledged";
  message?: string;
  last_push_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const PaymentReminderSchema = new Schema<IPaymentReminder>(
  {
    _id: { type: String, required: true },
    from_user_id: { type: String, required: true, index: true },
    to_user_id: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["sent", "acknowledged"],
      default: "sent",
    },
    message: { type: String },
    last_push_at: { type: Date },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.paymentReminders,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
PaymentReminderSchema.index({ to_user_id: 1, status: 1, created_at: -1 });
PaymentReminderSchema.index({ from_user_id: 1, status: 1, created_at: -1 });

export const PaymentReminder: Model<IPaymentReminder> =
  (mongoose.models.PaymentReminder as Model<IPaymentReminder>) ||
  mongoose.model<IPaymentReminder>("PaymentReminder", PaymentReminderSchema);

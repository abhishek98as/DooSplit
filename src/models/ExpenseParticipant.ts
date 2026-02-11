import mongoose, { Schema, Model } from "mongoose";

export interface IExpenseParticipant {
  _id: mongoose.Types.ObjectId;
  expenseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  paidAmount: number;
  owedAmount: number;
  isSettled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseParticipantSchema = new Schema<IExpenseParticipant>(
  {
    expenseId: {
      type: Schema.Types.ObjectId,
      ref: "Expense",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    paidAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    owedAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    isSettled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate participants
ExpenseParticipantSchema.index({ expenseId: 1, userId: 1 }, { unique: true });
ExpenseParticipantSchema.index({ userId: 1, isSettled: 1, expenseId: 1 });
ExpenseParticipantSchema.index({ expenseId: 1, isSettled: 1 });
// Removed: { userId: 1 } (prefix of compound), { expenseId: 1 } (prefix of unique compound), { isSettled: 1 } (low cardinality boolean)

const ExpenseParticipant: Model<IExpenseParticipant> =
  mongoose.models.ExpenseParticipant ||
  mongoose.model<IExpenseParticipant>(
    "ExpenseParticipant",
    ExpenseParticipantSchema
  );

export default ExpenseParticipant;

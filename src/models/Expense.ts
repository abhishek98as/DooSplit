import mongoose, { Schema, Model } from "mongoose";

export interface IExpense {
  _id: mongoose.Types.ObjectId;
  amount: number;
  description: string;
  category: string;
  date: Date;
  currency: string;
  createdBy: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;
  images: string[];
  notes?: string;
  isDeleted: boolean;
  editHistory: Array<{
    editedBy: mongoose.Types.ObjectId;
    editedAt: Date;
    changes: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    category: {
      type: String,
      required: true,
      enum: [
        "food",
        "transport",
        "shopping",
        "entertainment",
        "utilities",
        "rent",
        "healthcare",
        "other",
      ],
      default: "other",
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currency: {
      type: String,
      default: "INR",
      enum: ["INR", "USD", "EUR", "GBP", "AUD", "CAD"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        editedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        editedAt: {
          type: Date,
          default: Date.now,
        },
        changes: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ExpenseSchema.index({ createdBy: 1, date: -1 });
ExpenseSchema.index({ groupId: 1, date: -1 });
ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ isDeleted: 1 });

const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

export default Expense;

import mongoose, { Schema, Model } from "mongoose";

export interface IGroup {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  image?: string;
  type: "home" | "trip" | "couple" | "event" | "office" | "other";
  currency: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      maxlength: [100, "Group name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["home", "trip", "couple", "event", "office", "other"],
      default: "other",
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
GroupSchema.index({ createdBy: 1 });
GroupSchema.index({ createdAt: -1 });
GroupSchema.index({ isActive: 1 });

const Group: Model<IGroup> =
  mongoose.models.Group || mongoose.model<IGroup>("Group", GroupSchema);

export default Group;

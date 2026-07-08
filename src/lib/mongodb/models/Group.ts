import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IGroup {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  type: "Home" | "Trip" | "Couple" | "Event" | "Office" | "Other";
  created_by: string;
  is_active: boolean;
  currency: string;
  privacy: "public" | "private";
  created_at: Date;
  updated_at: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    type: {
      type: String,
      enum: ["Home", "Trip", "Couple", "Event", "Office", "Other"],
      default: "Other",
    },
    created_by: { type: String, required: true, index: true },
    is_active: { type: Boolean, default: true },
    currency: { type: String, default: "INR" },
    privacy: { type: String, enum: ["public", "private"], default: "public" },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.groups,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent: created_by + is_active + created_at DESC
GroupSchema.index({ created_by: 1, is_active: 1, created_at: -1 });

export const Group: Model<IGroup> =
  (mongoose.models.Group as Model<IGroup>) ||
  mongoose.model<IGroup>("Group", GroupSchema);

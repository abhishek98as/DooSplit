import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IGroupMember {
  _id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: Date;
  status: string;
  created_at: Date;
  updated_at: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>(
  {
    _id: { type: String, required: true },
    group_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    joined_at: { type: Date, default: () => new Date() },
    status: { type: String, default: "active" },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.groupMembers,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
GroupMemberSchema.index({ user_id: 1, group_id: 1 });
GroupMemberSchema.index({ group_id: 1, user_id: 1 });
GroupMemberSchema.index({ group_id: 1, role: 1 });

export const GroupMember: Model<IGroupMember> =
  (mongoose.models.GroupMember as Model<IGroupMember>) ||
  mongoose.model<IGroupMember>("GroupMember", GroupMemberSchema);

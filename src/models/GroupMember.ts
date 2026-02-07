import mongoose, { Schema, Model } from "mongoose";

export interface IGroupMember {
  _id: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: "admin" | "member";
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate memberships
GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
GroupMemberSchema.index({ userId: 1 });
GroupMemberSchema.index({ groupId: 1 });

const GroupMember: Model<IGroupMember> =
  mongoose.models.GroupMember ||
  mongoose.model<IGroupMember>("GroupMember", GroupMemberSchema);

export default GroupMember;

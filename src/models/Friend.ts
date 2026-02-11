import mongoose, { Schema, Model } from "mongoose";

export interface IFriend {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  friendId: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "rejected";
  requestedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FriendSchema = new Schema<IFriend>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    friendId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate friend relationships
FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });
FriendSchema.index({ friendId: 1, status: 1 });
FriendSchema.index({ userId: 1, status: 1, requestedBy: 1 });
FriendSchema.index({ userId: 1, createdAt: -1 });
FriendSchema.index({ friendId: 1, createdAt: -1 });
// Removed: { userId: 1, status: 1 } — prefix of { userId: 1, status: 1, requestedBy: 1 }

const Friend: Model<IFriend> =
  mongoose.models.Friend || mongoose.model<IFriend>("Friend", FriendSchema);

export default Friend;

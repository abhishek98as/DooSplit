import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IFriendship {
  _id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  requested_by?: string;
  created_at: Date;
  updated_at: Date;
}

const FriendshipSchema = new Schema<IFriendship>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    friend_id: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "accepted", "blocked"],
      default: "pending",
    },
    requested_by: { type: String },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.friendships,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
FriendshipSchema.index({ user_id: 1, status: 1, created_at: -1 });
FriendshipSchema.index({ friend_id: 1, status: 1, created_at: -1 });
FriendshipSchema.index({ user_id: 1, friend_id: 1, status: 1 });

export const Friendship: Model<IFriendship> =
  (mongoose.models.Friendship as Model<IFriendship>) ||
  mongoose.model<IFriendship>("Friendship", FriendshipSchema);

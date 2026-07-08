import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IInvitation {
  _id: string;
  invited_by: string;
  email: string;
  email_normalized: string;
  group_id?: string;
  status: "pending" | "accepted" | "rejected";
  invite_token?: string;
  created_at: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    _id: { type: String, required: true },
    invited_by: { type: String, required: true, index: true },
    email: { type: String, required: true },
    email_normalized: { type: String, required: true },
    group_id: { type: String },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    invite_token: { type: String },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.invitations,
    timestamps: { createdAt: "created_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
InvitationSchema.index({ invited_by: 1, created_at: -1 });
InvitationSchema.index({ invited_by: 1, email_normalized: 1 });
InvitationSchema.index({ invited_by: 1, email: 1 });
InvitationSchema.index({ email: 1, status: 1, created_at: -1 });

export const Invitation: Model<IInvitation> =
  (mongoose.models.Invitation as Model<IInvitation>) ||
  mongoose.model<IInvitation>("Invitation", InvitationSchema);

import mongoose, { Schema, Model } from "mongoose";

export interface IInvitation {
  _id: mongoose.Types.ObjectId;
  invitedBy: mongoose.Types.ObjectId;
  email: string;
  token: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "cancelled"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

InvitationSchema.index({ token: 1 }, { unique: true });
InvitationSchema.index({ email: 1, invitedBy: 1 });
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Invitation: Model<IInvitation> =
  mongoose.models.Invitation ||
  mongoose.model<IInvitation>("Invitation", InvitationSchema);

export default Invitation;

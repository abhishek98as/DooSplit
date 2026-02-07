import mongoose, { Schema, Model } from "mongoose";

export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "expense_added",
        "expense_updated",
        "expense_deleted",
        "settlement_recorded",
        "friend_request",
        "friend_accepted",
        "group_invitation",
        "group_expense",
        "payment_reminder",
        "comment_added",
      ],
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;

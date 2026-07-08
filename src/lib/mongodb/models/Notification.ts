import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface INotification {
  _id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_id?: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    related_id: { type: String },
    data: { type: Schema.Types.Mixed },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.notifications,
    timestamps: { createdAt: "created_at" },
    versionKey: false,
  }
);

// Firestore-equivalent composite indexes
NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ user_id: 1, created_at: -1 });

export const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

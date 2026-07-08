import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export type ActivityType =
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "expense_comment_added"
  | "expense_mentioned"
  | "recurring_expense_created"
  | "friend_added"
  | "friend_removed"
  | "friend_request_sent"
  | "group_created"
  | "group_deleted"
  | "group_member_added"
  | "settlement_added"
  | "smart_nudge";

export interface IActivityLog {
  _id: string;
  userId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  createdAtIso: string;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    actorName: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "expense_added",
        "expense_updated",
        "expense_deleted",
        "expense_comment_added",
        "expense_mentioned",
        "recurring_expense_created",
        "friend_added",
        "friend_removed",
        "friend_request_sent",
        "group_created",
        "group_deleted",
        "group_member_added",
        "settlement_added",
        "smart_nudge",
      ],
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: () => new Date() },
    createdAtIso: { type: String, required: true },
  },
  {
    collection: COLLECTIONS.activityLogs,
    timestamps: { createdAt: "createdAt" },
    versionKey: false,
  }
);

// Activity feed query patterns
ActivityLogSchema.index({ userId: 1, type: 1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

export const ActivityLog: Model<IActivityLog> =
  (mongoose.models.ActivityLog as Model<IActivityLog>) ||
  mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);

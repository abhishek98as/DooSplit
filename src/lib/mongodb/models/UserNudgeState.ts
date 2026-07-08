import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IUserNudgeState {
  _id: string;
  user_id: string;
  nudge_id: string;
  last_shown_at?: Date;
  dismissed_at?: Date;
  action_taken?: string;
  state: Record<string, unknown>;
}

const UserNudgeStateSchema = new Schema<IUserNudgeState>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    nudge_id: { type: String, required: true },
    last_shown_at: { type: Date },
    dismissed_at: { type: Date },
    action_taken: { type: String },
    state: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: COLLECTIONS.userNudgeStates,
    timestamps: true,
    versionKey: false,
  }
);

UserNudgeStateSchema.index({ user_id: 1, nudge_id: 1 }, { unique: true });

export const UserNudgeState: Model<IUserNudgeState> =
  (mongoose.models.UserNudgeState as Model<IUserNudgeState>) ||
  mongoose.model<IUserNudgeState>("UserNudgeState", UserNudgeStateSchema);

import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IFeatureFeedback {
  _id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  upvotes: number;
  created_at: Date;
}

const FeatureFeedbackSchema = new Schema<IFeatureFeedback>(
  {
    _id: { type: String, required: true },
    user_id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true, index: true },
    upvotes: { type: Number, default: 0 },
    created_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.featureFeedback,
    timestamps: { createdAt: "created_at" },
    versionKey: false,
  }
);

// Category + upvotes sort
FeatureFeedbackSchema.index({ category: 1, upvotes: -1 });

export const FeatureFeedback: Model<IFeatureFeedback> =
  (mongoose.models.FeatureFeedback as Model<IFeatureFeedback>) ||
  mongoose.model<IFeatureFeedback>("FeatureFeedback", FeatureFeedbackSchema);

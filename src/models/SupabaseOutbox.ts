import mongoose, { Schema, Model } from "mongoose";

export interface ISupabaseOutbox {
  _id: mongoose.Types.ObjectId;
  idempotencyKey: string;
  operation: "upsert" | "delete";
  table: string;
  recordId: string;
  payload?: Record<string, any>;
  status: "pending" | "processing" | "done" | "failed";
  retries: number;
  maxRetries: number;
  error?: string;
  nextRetryAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SupabaseOutboxSchema = new Schema<ISupabaseOutbox>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    operation: {
      type: String,
      required: true,
      enum: ["upsert", "delete"],
    },
    table: {
      type: String,
      required: true,
      index: true,
    },
    recordId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
      index: true,
    },
    retries: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: 10,
      min: 1,
    },
    error: {
      type: String,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

SupabaseOutboxSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });

const SupabaseOutbox: Model<ISupabaseOutbox> =
  mongoose.models.SupabaseOutbox ||
  mongoose.model<ISupabaseOutbox>("SupabaseOutbox", SupabaseOutboxSchema);

export default SupabaseOutbox;

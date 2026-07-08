import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface IUser {
  _id: string;
  email: string;
  email_normalized: string;
  name: string;
  name_normalized: string;
  phone?: string;
  profile_picture?: string;
  default_currency: string;
  timezone: string;
  language: string;
  is_active: boolean;
  is_dummy?: boolean;
  created_by?: string;
  role: string;
  email_verified: boolean;
  auth_provider: string;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  fcm_tokens: string[];
  created_at: Date;
  updated_at: Date;
}

const UserSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true },
    email_normalized: { type: String, required: true, index: true },
    name: { type: String, required: true },
    name_normalized: { type: String, required: true, index: true },
    phone: { type: String },
    profile_picture: { type: String },
    default_currency: { type: String, default: "INR" },
    timezone: { type: String, default: "UTC" },
    language: { type: String, default: "en" },
    is_active: { type: Boolean, default: true, index: true },
    is_dummy: { type: Boolean, default: false },
    created_by: { type: String },
    role: { type: String, default: "user" },
    email_verified: { type: Boolean, default: false },
    auth_provider: { type: String, default: "email" },
    push_notifications_enabled: { type: Boolean, default: true },
    email_notifications_enabled: { type: Boolean, default: true },
    fcm_tokens: { type: [String], default: [] },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  {
    collection: COLLECTIONS.users,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// Indexes matching Firestore access patterns
UserSchema.index({ email_normalized: 1 });
UserSchema.index({ name_normalized: 1 });
UserSchema.index({ is_active: 1 });

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

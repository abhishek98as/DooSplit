import mongoose, { Schema, Model } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  name: string;
  phone?: string;
  profilePicture?: string;
  defaultCurrency: string;
  timezone?: string;
  language: string;
  isActive: boolean;
  isDummy: boolean;
  createdBy?: mongoose.Types.ObjectId;
  role: "user" | "admin";
  emailVerified: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function(this: IUser) { return !this.isDummy; },
      minlength: [6, "Password must be at least 6 characters"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    defaultCurrency: {
      type: String,
      default: "INR",
      enum: ["INR", "USD", "EUR", "GBP", "AUD", "CAD"],
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    language: {
      type: String,
      default: "en",
      enum: ["en", "hi"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDummy: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
// Note: email index is already created by 'unique: true' in field definition
// Note: phone index is already created by 'sparse: true' in field definition
UserSchema.index({ createdAt: -1 });

// Don't return password in queries by default
UserSchema.set("toJSON", {
  transform: function (_doc: any, ret: any) {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;

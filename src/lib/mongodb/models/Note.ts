import mongoose, { Schema, type Model } from "mongoose";
import { COLLECTIONS } from "../collections";

export interface INoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INote {
  _id: string; // matches note id
  userId: string; // owner of the note
  title: string;
  text?: string;
  type: "text" | "list";
  items: INoteChecklistItem[];
  color: string; // "", "amber", "coral", etc.
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  reminder?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NoteChecklistItemSchema = new Schema<INoteChecklistItem>({
  id: { type: String, required: true },
  text: { type: String, default: "" },
  done: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

const NoteSchema = new Schema<INote>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    text: { type: String, default: "" },
    type: { type: String, enum: ["text", "list"], default: "list" },
    items: { type: [NoteChecklistItemSchema], default: [] },
    color: { type: String, default: "" },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    trashed: { type: Boolean, default: false },
    reminder: { type: Date, default: null },
  },
  {
    collection: COLLECTIONS.notes,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    versionKey: false,
  }
);

// Indexes matching query patterns
NoteSchema.index({ userId: 1, trashed: 1, archived: 1 });
NoteSchema.index({ userId: 1, updatedAt: -1 });

export const Note: Model<INote> =
  (mongoose.models.Note as Model<INote>) ||
  mongoose.model<INote>("Note", NoteSchema);

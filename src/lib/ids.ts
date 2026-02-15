import crypto from "crypto";

export function newAppId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function ensureUserId(uid: string): string {
  if (!uid || !uid.trim()) {
    throw new Error("Invalid Firebase user id");
  }
  return uid;
}

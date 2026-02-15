import "server-only";
import { getFirestore, type Firestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { adminApp, adminAuth } from "@/lib/firebase-admin";

let firestoreInstance: Firestore | null = null;
const FIRESTORE_DATABASE_ID =
  process.env.FIREBASE_DATABASE_ID?.trim() ||
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID?.trim() ||
  "(default)";

export function getAdminDb(): Firestore {
  if (!adminApp) {
    throw new Error("Firebase Admin is not initialized");
  }

  if (!firestoreInstance) {
    firestoreInstance = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
  }

  return firestoreInstance;
}

export function getAdminAuth() {
  if (!adminAuth) {
    throw new Error("Firebase Admin Auth is not initialized");
  }
  return adminAuth;
}

export function getAdminStorage() {
  if (!adminApp) {
    throw new Error("Firebase Admin is not initialized");
  }
  return getStorage(adminApp);
}

export { FieldValue, Timestamp };

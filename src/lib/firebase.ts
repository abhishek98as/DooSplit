import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";

function resolveProjectId(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (explicit) {
    return explicit;
  }

  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (!authDomain) {
    return undefined;
  }

  const inferred = authDomain.split(".")[0]?.trim();
  return inferred || undefined;
}

function resolveStorageBucket(projectId?: string): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (explicit) {
    return explicit.replace(/^gs:\/\//, "");
  }

  if (!projectId) {
    return undefined;
  }

  return `${projectId}.firebasestorage.app`;
}

const resolvedProjectId = resolveProjectId();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: resolvedProjectId,
  storageBucket: resolveStorageBucket(resolvedProjectId),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (singleton)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const firestoreDatabaseId =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID?.trim() ||
  resolvedProjectId ||
  "(default)";

function initFirestoreInstance() {
  if (typeof window !== "undefined") {
    try {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        firestoreDatabaseId
      );
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        !message.includes("already been initialized") &&
        !message.includes("already been started")
      ) {
        console.warn("Firestore persistence initialization fallback:", message);
      }
    }
  }

  return getFirestore(app, firestoreDatabaseId);
}
export const db = initFirestoreInstance();

export {
  app,
  auth,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  updateProfile,
};
export type { FirebaseUser };

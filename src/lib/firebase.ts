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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
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
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
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

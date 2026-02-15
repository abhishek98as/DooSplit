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

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
  const unwrapped =
    hasDoubleQuotes || hasSingleQuotes ? trimmed.slice(1, -1).trim() : trimmed;

  // Vercel env sync via stdin can accidentally persist a literal trailing "\r\n".
  const withoutTrailingEscapedNewlines = unwrapped.replace(
    /(\\r\\n|\\n|\\r)+$/g,
    ""
  );
  const normalized = withoutTrailingEscapedNewlines.trim();
  return normalized || undefined;
}

function readPublicEnv(name: string): string | undefined {
  return normalizeEnvValue(process.env[name]);
}

function resolveProjectId(): string | undefined {
  const explicit = readPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (explicit) {
    return explicit;
  }

  const authDomain = readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!authDomain) {
    return undefined;
  }

  const inferred = authDomain.split(".")[0]?.trim();
  return inferred || undefined;
}

function resolveStorageBucket(projectId?: string): string | undefined {
  const explicit = readPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
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
  apiKey: readPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: resolvedProjectId,
  storageBucket: resolveStorageBucket(resolvedProjectId),
  messagingSenderId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  measurementId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
};

// Initialize Firebase (singleton)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const firestoreDatabaseId =
  readPublicEnv("NEXT_PUBLIC_FIREBASE_DATABASE_ID") ||
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

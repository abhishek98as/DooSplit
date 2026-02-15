import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let initError: string | null = null;

function getProjectId(): string | null {
  const explicit =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (explicit) {
    return explicit;
  }

  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (!authDomain) {
    return null;
  }

  const inferred = authDomain.split(".")[0]?.trim();
  return inferred || null;
}

function getStorageBucket(projectId: string): string | undefined {
  const explicit =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();

  if (explicit) {
    return explicit.replace(/^gs:\/\//, "");
  }

  return `${projectId}.firebasestorage.app`;
}

function initFirebaseAdminApp(): App | null {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const projectId = getProjectId();
  if (!projectId) {
    initError =
      "FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set";
    return null;
  }

  const storageBucket = getStorageBucket(projectId);

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId,
        storageBucket,
      });
    }

    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        storageBucket,
      });
    }

    return initializeApp({ projectId, storageBucket });
  } catch (error: any) {
    initError = error?.message || "Firebase Admin initialization failed";
    return null;
  }
}

try {
  adminApp = initFirebaseAdminApp();
  if (adminApp) {
    adminAuth = getAuth(adminApp);
  }
} catch (error: any) {
  initError = error?.message || "Firebase Admin auth initialization failed";
}

export { adminApp, adminAuth, initError };

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let initError: string | null = null;

function getFirebaseAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    initError = "NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set";
    console.error("❌ Firebase Admin:", initError);
    return null;
  }

  try {
    // Option 1: Full service account JSON
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
    }

    // Option 2: Individual credential fields
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Handle escaped newlines in the private key
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }

    // Option 3: Fallback for environments with Application Default Credentials (GCP)
    console.warn("⚠️ Firebase Admin: No service account credentials found. Google sign-in will not work.");
    console.warn("   Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL");
    return initializeApp({ projectId });
  } catch (error: any) {
    initError = error.message;
    console.error("❌ Firebase Admin initialization failed:", error.message);
    return null;
  }
}

try {
  adminApp = getFirebaseAdminApp();
  if (adminApp) {
    adminAuth = getAuth(adminApp);
  }
} catch (error: any) {
  initError = error.message;
  console.error("❌ Firebase Admin auth init failed:", error.message);
}

export { adminApp, adminAuth, initError };

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Use service account credentials if available, otherwise use project ID
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  // Fallback: initialize with project ID only (works in some environments)
  return initializeApp({
    projectId,
  });
}

const adminApp = getFirebaseAdminApp();
const adminAuth = getAuth(adminApp);

export { adminApp, adminAuth };

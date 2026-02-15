import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let initError: string | null = null;

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
  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed;
}

function getProjectId(): string | null {
  const explicit =
    normalizeEnvValue(process.env.FIREBASE_PROJECT_ID) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  if (explicit) {
    return explicit;
  }

  const authDomain = normalizeEnvValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  if (!authDomain) {
    return null;
  }

  const inferred = authDomain.split(".")[0]?.trim();
  return inferred || null;
}

function getStorageBucket(projectId: string): string | undefined {
  const explicit =
    normalizeEnvValue(process.env.FIREBASE_STORAGE_BUCKET) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

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
    const serviceAccountKey = normalizeEnvValue(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY);
    const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId,
        storageBucket,
      });
    }

    if (privateKey && clientEmail) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
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

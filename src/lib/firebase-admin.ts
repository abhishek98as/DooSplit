import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let initError: string | null = null;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
  const unwrapped = hasDoubleQuotes || hasSingleQuotes ? trimmed.slice(1, -1).trim() : trimmed;
  const withoutTrailingEscapedNewlines = unwrapped.replace(/(\\r\\n|\\n|\\r)+$/g, "");
  const normalized = withoutTrailingEscapedNewlines.trim();
  return normalized || undefined;
}

function getProjectId(): string | null {
  const explicit =
    normalizeEnvValue(process.env.FIREBASE_PROJECT_ID) ||
    normalizeEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (explicit) return explicit;
  const authDomain = normalizeEnvValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  if (!authDomain) return null;
  const inferred = authDomain.split(".")[0]?.trim();
  return inferred || null;
}

function initFirebaseAdminApp(): App | null {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = getProjectId();
  if (!projectId) return null;

  try {
    const serviceAccountKey = normalizeEnvValue(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY);
    const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      return initializeApp({ credential: cert(serviceAccount), projectId });
    }

    if (privateKey && clientEmail) {
      return initializeApp({
        credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
      });
    }

    return initializeApp({ projectId });
  } catch {
    return null;
  }
}

try {
  adminApp = initFirebaseAdminApp();
  if (adminApp) adminAuth = getAuth(adminApp);
} catch {
  // Silently handle — auth will fall back gracefully
}

export function getFirebaseAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(adminApp!);
  return adminAuth;
}

export { adminApp, adminAuth, initError };

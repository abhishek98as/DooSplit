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

  const withoutTrailingEscapedNewlines = unwrapped.replace(
    /(\\r\\n|\\n|\\r)+$/g,
    ""
  );
  const normalized = withoutTrailingEscapedNewlines.trim();
  return normalized || undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

const cookieNameCandidate = normalizeEnvValue(process.env.FIREBASE_SESSION_COOKIE_NAME);
const validCookieNamePattern = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

export const FIREBASE_SESSION_COOKIE_NAME =
  cookieNameCandidate && validCookieNamePattern.test(cookieNameCandidate)
    ? cookieNameCandidate
    : "firebase-session";

export const FIREBASE_SESSION_MAX_AGE_SECONDS =
  parsePositiveInt(process.env.FIREBASE_SESSION_MAX_AGE_SECONDS) ||
  60 * 60 * 24 * 14;

export function getSessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: FIREBASE_SESSION_MAX_AGE_SECONDS,
  };
}

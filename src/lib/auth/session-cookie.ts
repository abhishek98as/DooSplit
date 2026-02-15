export const FIREBASE_SESSION_COOKIE_NAME =
  process.env.FIREBASE_SESSION_COOKIE_NAME || "firebase-session";

export const FIREBASE_SESSION_MAX_AGE_SECONDS = Number(
  process.env.FIREBASE_SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 14
);

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

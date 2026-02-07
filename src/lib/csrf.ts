/**
 * CSRF Protection using Double Submit Cookie pattern
 */

import crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Validate CSRF token from request
 */
export function validateCsrfToken(request: Request): boolean {
  // GET, HEAD, OPTIONS requests don't need CSRF validation
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  // Get token from cookie
  const cookies = request.headers.get("cookie") || "";
  const cookieToken = parseCookie(cookies, CSRF_COOKIE_NAME);

  // Both must exist and match
  if (!headerToken || !cookieToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(headerToken, cookieToken);
}

/**
 * Parse cookie value from cookie string
 */
function parseCookie(cookieString: string, name: string): string | null {
  const matches = cookieString.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return matches ? decodeURIComponent(matches[1]) : null;
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create CSRF token cookie header
 */
export function createCsrfCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24; // 24 hours

  return [
    `${CSRF_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProduction ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Create CSRF error response
 */
export function createCsrfErrorResponse() {
  return new Response(
    JSON.stringify({
      error: "Invalid CSRF token",
      message: "CSRF validation failed. Please refresh and try again.",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Endpoint to get a new CSRF token
 * Add this to your API routes: GET /api/csrf-token
 */
export function getCsrfTokenResponse(): Response {
  const token = generateCsrfToken();
  
  return new Response(
    JSON.stringify({ csrfToken: token }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createCsrfCookie(token),
      },
    }
  );
}

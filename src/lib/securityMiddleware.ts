/**
 * Security Middleware Examples
 * 
 * This file demonstrates how to use rate limiting and CSRF protection
 * in your API routes
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { validateCsrfToken, createCsrfErrorResponse } from "@/lib/csrf";
import { getServerAppUser } from "@/lib/auth/server-session";

/**
 * Apply rate limiting to a route handler
 * 
 * @example
 * export async function POST(request: NextRequest) {
 *   const rateLimitResult = await applyRateLimit(request, RATE_LIMITS.auth);
 *   if (!rateLimitResult.allowed) {
 *     return rateLimitResult.response;
 *   }
 *   
 *   // Your route logic here
 * }
 */
export async function applyRateLimit(
  request: NextRequest,
  config = RATE_LIMITS.api,
  userId?: string
) {
  const result = checkRateLimit(request, config, userId);

  return {
    allowed: result.allowed,
    response: result.allowed ? null : createRateLimitResponse(result),
    headers: {
      "X-RateLimit-Limit": String(config.maxTokens),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetTime),
    },
  };
}

/**
 * Apply CSRF protection to a route handler
 * Only validates for POST, PUT, DELETE, PATCH methods
 * 
 * @example
 * export async function POST(request: NextRequest) {
 *   if (!applyCsrfProtection(request)) {
 *     return createCsrfErrorResponse();
 *   }
 *   
 *   // Your route logic here
 * }
 */
export function applyCsrfProtection(request: NextRequest): boolean {
  const isEnabled = process.env.ENABLE_CSRF_PROTECTION !== "false";
  if (!isEnabled) return true;

  return validateCsrfToken(request);
}

/**
 * Combined security middleware - applies both rate limiting and CSRF
 * 
 * @example
 * export async function POST(request: NextRequest) {
 *   const security = await securityMiddleware(request, {
 *     rateLimit: RATE_LIMITS.strict,
 *     csrf: true,
 *   });
 *   
 *   if (security.error) {
 *     return security.error;
 *   }
 *   
 *   // Your route logic here
 *   const response = NextResponse.json({ success: true });
 *   
 *   // Apply rate limit headers
 *   Object.entries(security.headers).forEach(([key, value]) => {
 *     response.headers.set(key, value);
 *   });
 *   
 *   return response;
 * }
 */
export async function securityMiddleware(
  request: NextRequest,
  options: {
    rateLimit?: typeof RATE_LIMITS.api;
    csrf?: boolean;
    userId?: string;
  } = {}
) {
  const headers: Record<string, string> = {};

  // Apply rate limiting
  if (options.rateLimit) {
    const rateLimitResult = await applyRateLimit(
      request,
      options.rateLimit,
      options.userId
    );

    if (!rateLimitResult.allowed) {
      return {
        error: rateLimitResult.response,
        headers: {},
      };
    }

    Object.assign(headers, rateLimitResult.headers);
  }

  // Apply CSRF protection
  if (options.csrf && !applyCsrfProtection(request)) {
    return {
      error: createCsrfErrorResponse(),
      headers: {},
    };
  }

  return {
    error: null,
    headers,
  };
}

/**
 * Get authenticated user with rate limiting
 * Useful for protecting routes that require authentication
 * 
 * @example
 * const { user, error } = await withAuth(request);
 * if (error) return error;
 * 
 * // Use user.id in your route logic
 */
export async function withAuth(request: NextRequest) {
  const user = await getServerAppUser(request);

  if (!user?.id) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Apply rate limiting with user ID
  const rateLimitResult = await applyRateLimit(
    request,
    RATE_LIMITS.api,
    user.id
  );

  if (!rateLimitResult.allowed) {
    return {
      user: null,
      error: rateLimitResult.response,
    };
  }

  return {
    user: {
      id: user.id,
      email: user.email || null,
      name: user.name || null,
      role: user.role || "user",
    },
    error: null,
    headers: rateLimitResult.headers,
  };
}

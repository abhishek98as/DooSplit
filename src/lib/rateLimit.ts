/**
 * Rate Limiting Middleware
 * Implements token bucket algorithm for rate limiting
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

// In-memory store (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  maxTokens: number; // Maximum number of tokens in the bucket
  refillRate: number; // Tokens added per second
  windowMs: number; // Time window in milliseconds
}

// Different rate limits for different endpoints
export const RATE_LIMITS = {
  // Authentication endpoints - stricter limits
  auth: {
    maxTokens: 5,
    refillRate: 1 / 60, // 1 request per minute
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // Password reset - very strict
  passwordReset: {
    maxTokens: 3,
    refillRate: 1 / 300, // 1 request per 5 minutes
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  // API endpoints - moderate limits
  api: {
    maxTokens: 100,
    refillRate: 10, // 10 requests per second
    windowMs: 60 * 1000, // 1 minute
  },
  // Strict for sensitive operations
  strict: {
    maxTokens: 10,
    refillRate: 1, // 1 request per second
    windowMs: 60 * 1000, // 1 minute
  },
};

/**
 * Get client identifier (IP address or user ID)
 */
function getClientId(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  
  // Get IP from various headers
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  
  const ip = forwarded?.split(",")[0] || realIp || cfConnectingIp || "unknown";
  return `ip:${ip}`;
}

/**
 * Check if request is within rate limit
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMITS.api,
  userId?: string
): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
} {
  const clientId = getClientId(request, userId);
  const now = Date.now();
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(clientId);
  
  if (!entry) {
    entry = {
      tokens: config.maxTokens,
      lastRefill: now,
    };
    rateLimitStore.set(clientId, entry);
  }
  
  // Calculate tokens to add based on time passed
  const timePassed = now - entry.lastRefill;
  const tokensToAdd = (timePassed / 1000) * config.refillRate;
  
  entry.tokens = Math.min(config.maxTokens, entry.tokens + tokensToAdd);
  entry.lastRefill = now;
  
  // Check if request can proceed
  const allowed = entry.tokens >= 1;
  
  if (allowed) {
    entry.tokens -= 1;
  }
  
  const resetTime = now + config.windowMs;
  const retryAfter = allowed ? undefined : Math.ceil((1 - entry.tokens) / config.refillRate);
  
  return {
    allowed,
    remaining: Math.floor(entry.tokens),
    resetTime,
    retryAfter,
  };
}

/**
 * Cleanup old entries periodically
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.lastRefill > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every hour
if (typeof setInterval !== "undefined") {
  setInterval(cleanupRateLimitStore, 60 * 60 * 1000);
}

/**
 * Rate limit response helper
 */
export function createRateLimitResponse(result: ReturnType<typeof checkRateLimit>) {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(RATE_LIMITS.api.maxTokens),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetTime),
        "Retry-After": String(result.retryAfter || 0),
      },
    }
  );
}

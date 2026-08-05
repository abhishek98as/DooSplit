/**
 * Server-side Pro plan helpers.
 * plan defaults to "free" when unset. Admin/script can set plan="pro".
 */
import "server-only";

export type UserPlan = "free" | "pro";

export function resolveUserPlan(user: {
  plan?: string | null;
  plan_expires_at?: string | null;
} | null | undefined): UserPlan {
  if (!user) return "free";
  if (String(user.plan || "").toLowerCase() !== "pro") return "free";
  if (user.plan_expires_at) {
    const expires = new Date(user.plan_expires_at).getTime();
    if (Number.isFinite(expires) && expires < Date.now()) return "free";
  }
  return "pro";
}

export function isProUser(user: {
  plan?: string | null;
  plan_expires_at?: string | null;
} | null | undefined): boolean {
  return resolveUserPlan(user) === "pro";
}

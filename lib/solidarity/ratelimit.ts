import { RATE_LIMITS } from "./config";

export type RateKind = "reports" | "checkins";

/** Client-side/server-side pre-check mirroring the database trigger (which is the real enforcement). */
export function rateLimit(
  timestamps: readonly (string | Date)[],
  kind: RateKind,
  now: Date = new Date(),
): { allowed: boolean; remaining: number; retryAt: Date | null } {
  const cap = RATE_LIMITS[kind];
  const since = now.getTime() - RATE_LIMITS.windowMs;
  const recent = timestamps.map((t) => new Date(t).getTime()).filter((t) => t > since).sort((a, b) => a - b);
  if (recent.length < cap) return { allowed: true, remaining: cap - recent.length, retryAt: null };
  // Allowed again once the oldest counted submission leaves the window.
  return { allowed: false, remaining: 0, retryAt: new Date(recent[recent.length - cap] + RATE_LIMITS.windowMs) };
}

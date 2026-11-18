import { MIN_PUBLIC_COUNT } from "./config";
import type { CheckinStatus } from "./types";

export type SafetyTotals =
  | { kind: "not_enough" }
  | { kind: "ok"; total: number; on_my_way: number; voted: number; home_safe: number };

/**
 * Public safety totals for one unit. need_help check-ins are never public and never counted here.
 * Below the minimum the answer is "not enough", never a count, so a single person cannot be pointed at.
 */
export function safetyTotals(checkins: readonly { status: CheckinStatus }[], min: number = MIN_PUBLIC_COUNT): SafetyTotals {
  const pub = checkins.filter((c) => c.status !== "need_help");
  if (pub.length < min) return { kind: "not_enough" };
  const n = (s: CheckinStatus) => pub.filter((c) => c.status === s).length;
  return { kind: "ok", total: pub.length, on_my_way: n("on_my_way"), voted: n("voted"), home_safe: n("home_safe") };
}

/** Responder queue ordering: need_help first, then oldest first. */
export function responderOrder<T extends { needHelp: boolean; createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(b.needHelp) - Number(a.needHelp) || a.createdAt.localeCompare(b.createdAt));
}

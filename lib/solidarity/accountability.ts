import type { AccountabilityStatus } from "./types";

export type StatusEvent = { status: "seen" | "responded"; at: string | Date };

/**
 * Status of a report, worked out when it is read (no scheduled job).
 * The last event wins. With no event, a report older than the SLA becomes "no_response".
 * The boundary is strict: exactly at the SLA it is still "reported".
 */
export function accountabilityStatus(input: {
  createdAt: string | Date;
  lastEvent: StatusEvent | null;
  now?: Date;
  slaMinutes: number;
}): AccountabilityStatus {
  if (input.lastEvent) return input.lastEvent.status;
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - new Date(input.createdAt).getTime();
  return ageMs > input.slaMinutes * 60_000 ? "no_response" : "reported";
}

/** Minutes since the report was filed, for "no response after X" wording. */
export const minutesSince = (at: string | Date, now: Date = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 60_000));

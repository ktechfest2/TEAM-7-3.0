/** Solidarity settings. Numeric limits mirror the SQL in supabase/migrations/20261119000000_solidarity.sql. */

/** The whole feature is off unless this is "true". Read directly so Next can inline it. */
export const SOLIDARITY_ENABLED = process.env.NEXT_PUBLIC_SOLIDARITY_ENABLED === "true";

/** A unit's safety totals are shown only once it has at least this many public check-ins. */
export const MIN_PUBLIC_COUNT = 5;

/** Per device, per rolling hour. Enforced by a database trigger; this copy is for UI and tests. */
export const RATE_LIMITS = { reports: 5, checkins: 20, windowMs: 60 * 60 * 1000 } as const;

export const DEFAULT_SLA_MINUTES = 360;

/** Minutes a report may wait for a first response. Set INCIDENT_SLA_MINUTES=2 to show the clock live. */
export function slaMinutes(raw: string | undefined = process.env.INCIDENT_SLA_MINUTES): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n > 0 ? n : DEFAULT_SLA_MINUTES;
}

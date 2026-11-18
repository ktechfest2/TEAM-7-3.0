import type { CheckinStatus } from "./types";

const WORDS: Record<string, CheckinStatus> = { SAFE: "home_safe", VOTED: "voted", HELP: "need_help" };

export type SmsResult =
  | { ok: true; unitCode: string; status: CheckinStatus }
  | { ok: false; reason: "format" | "status" | "unit" };

/**
 * Simulated feature-phone check-in: "CT <unitcode> SAFE | VOTED | HELP".
 * Feeds the same check-in code as the app. Real SMS would need a telecom provider.
 */
export function parseSms(text: string, knownUnitCodes: readonly string[]): SmsResult {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 3 || parts[0].toUpperCase() !== "CT") return { ok: false, reason: "format" };
  const unitCode = knownUnitCodes.find((c) => c.toUpperCase() === parts[1].toUpperCase());
  if (!unitCode) return { ok: false, reason: "unit" };
  const status = WORDS[parts[2].toUpperCase()];
  if (!status) return { ok: false, reason: "status" };
  return { ok: true, unitCode, status };
}

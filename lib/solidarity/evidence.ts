import type { EvidenceLevel } from "./types";

/** Confirmations needed (from different devices, not the reporter) before a report counts as confirmed. */
export const CONFIRMATIONS_NEEDED = 2;

export type ConfirmCheck = "ok" | "own_report" | "duplicate";

/** Can this device add "I saw this too"? The reporter cannot confirm their own report, and each device counts once. */
export function canConfirm(reporterDeviceId: string, deviceId: string, existingDeviceIds: readonly string[]): ConfirmCheck {
  if (deviceId === reporterDeviceId) return "own_report";
  if (existingDeviceIds.includes(deviceId)) return "duplicate";
  return "ok";
}

/** Distinct confirming devices, excluding the reporter. */
export function countConfirmations(reporterDeviceId: string, deviceIds: readonly string[]): number {
  return new Set(deviceIds.filter((d) => d !== reporterDeviceId)).size;
}

/** An evidence LEVEL, never a verdict. Confirmed outranks media. */
export function evidenceLevel(report: { hasMedia: boolean; confirmations: number }): EvidenceLevel {
  if (report.confirmations >= CONFIRMATIONS_NEEDED) return "confirmed";
  return report.hasMedia ? "backed_by_media" : "reported";
}

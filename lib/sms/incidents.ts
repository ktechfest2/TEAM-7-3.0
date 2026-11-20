export const INCIDENTS = {
  VUB: "Vote buying",
  VIO: "Violence",
  MSB: "INEC staff misbehaviour",
  BOG: "Ballot grabbing",
  INT: "Intimidation",
} as const;

export type IncidentCode = keyof typeof INCIDENTS;

/** Reports older than this are omitted from live incident lookups and feeds. */
export const INCIDENT_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Accepts the compact card format and readable variants, optionally after a shared-code keyword. */
export function parseIncidentMessage(input: string): { unitCode: string; incidentCode: IncidentCode } | null {
  const normalized = input.trim().toUpperCase().replace(/\s+/g, " ");
  const withoutKeyword = normalized.replace(/^(?:COUNTRACK|CT)\s+/, "");
  const match = withoutKeyword.match(/^(?:PU\s*)?(\d{2}\/\d{2}\/\d{2}\/\d{3})\s*(VUB|VIO|MSB|BOG|INT)$/);
  if (!match) return null;
  return { unitCode: match[1], incidentCode: match[2] as IncidentCode };
}

export function helpReply() {
  return "Format: PU<state>/<LGA>/<ward>/<unit><code>. Example: PU37/05/04/017VUB. Codes: VUB, VIO, MSB, BOG, INT.";
}

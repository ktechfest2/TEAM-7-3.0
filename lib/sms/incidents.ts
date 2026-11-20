export const INCIDENTS = {
  VUB: "Vote buying",
  VIO: "Violence",
  MSB: "INEC staff misbehaviour",
  BOG: "Ballot grabbing",
  INT: "Intimidation",
} as const;

export type IncidentCode = keyof typeof INCIDENTS;
export type IncidentCounts = Partial<Record<IncidentCode, number>>;

/** Reports older than this are omitted from live incident lookups and feeds. */
export const INCIDENT_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Accepts the compact card format and readable variants, optionally after a shared-code keyword. */
export function parseIncidentMessage(input: string): { unitCode: string; incidentCode: IncidentCode } | null {
  const withoutKeyword = stripSharedKeyword(input);
  const match = withoutKeyword.match(/^(?:PU\s*)?(\d{2}\/\d{2}\/\d{2}\/\d{3})\s*(VUB|VIO|MSB|BOG|INT)$/);
  if (!match) return null;
  return { unitCode: match[1], incidentCode: match[2] as IncidentCode };
}

/** The single lookup command is `LKP`, e.g. `LKP PU37/05/04/017`. */
export function parseIncidentLookupMessage(input: string): { unitCode: string } | null {
  const match = stripSharedKeyword(input).match(/^LKP\s*(?:PU\s*)?(\d{2}\/\d{2}\/\d{2}\/\d{3})$/);
  return match ? { unitCode: match[1] } : null;
}

function stripSharedKeyword(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, " ").replace(/^(?:COUNTRACK|CT)\s+/, "");
}

/** Keeps the response brief enough for SMS while making its 24-hour scope and status clear. */
export function formatIncidentLookupReply(unitCode: string, counts: IncidentCounts, simulated = false): string {
  const entries = Object.entries(counts)
    .filter((entry): entry is [IncidentCode, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const prefix = `${simulated ? "SIMULATED " : ""}${unitCode} (last 24h): `;
  const suffix = " Public reports; not verified.";
  if (entries.length === 0) return `${prefix}No incident reports.${suffix}`;

  const shown = entries.slice(0, 3).map(([code, count]) => `${INCIDENTS[code]} ${count}`);
  if (entries.length > shown.length) shown.push(`+${entries.length - shown.length} other types`);
  return `${prefix}${shown.join(", ")}.${suffix}`;
}

export function helpReply() {
  return "Report: PU<state>/<LGA>/<ward>/<unit><incident code>, e.g. PU37/05/04/017VUB. Lookup: LKP PU<state>/<LGA>/<ward>/<unit>, e.g. LKP PU37/05/04/017. Incident codes: VUB, VIO, MSB, BOG, INT.";
}

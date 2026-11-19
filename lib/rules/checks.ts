import type { CheckFlag, CheckMeta, ExtractedResult } from "../schemas";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

const REQUIRED = ["registered", "accredited", "total_valid", "votes_cast"] as const;

export const sumScores = (scores: Record<string, number>) =>
  Object.values(scores).reduce((a, b) => a + b, 0);

/** Flags impossible or unreadable numbers on one reading. Pure, no AI. */
export function checkResult(r: ExtractedResult, meta: CheckMeta = {}): CheckFlag[] {
  if (meta.isResultSheet === false) return [{ code: "NOT_A_RESULT_SHEET", severity: "blocking" }];
  if (meta.legible === false) return [{ code: "SHEET_ILLEGIBLE", severity: "blocking" }];

  const flags: CheckFlag[] = [];
  const missing = new Set<string>();
  const markMissing = (field: string) => {
    if (missing.has(field)) return;
    missing.add(field);
    flags.push({ code: "MISSING_FIELD", severity: "blocking", field });
  };

  for (const f of REQUIRED) if (r[f] === null) markMissing(f);
  if (Object.keys(r.party_scores).length === 0) markMissing("party_scores");
  for (const f of meta.unreadable ?? []) markMissing(f);

  const { registered, accredited, rejected, total_valid, votes_cast } = r;

  if (votes_cast !== null && accredited !== null && votes_cast > accredited)
    flags.push({ code: "VOTES_CAST_GT_ACCREDITED", severity: "warning", expected: accredited, actual: votes_cast });

  if (accredited !== null && registered !== null && accredited > registered)
    flags.push({ code: "ACCREDITED_GT_REGISTERED", severity: "warning", expected: registered, actual: accredited });

  const partySum = sumScores(r.party_scores);
  if (total_valid !== null && Object.keys(r.party_scores).length > 0 && partySum !== total_valid)
    flags.push({ code: "PARTY_SUM_NE_TOTAL_VALID", severity: "warning", expected: total_valid, actual: partySum });

  if (total_valid !== null && rejected !== null && votes_cast !== null && total_valid + rejected !== votes_cast)
    flags.push({ code: "VALID_PLUS_REJECTED_NE_CAST", severity: "warning", expected: votes_cast, actual: total_valid + rejected });

  for (const field of meta.conflicts ?? [])
    flags.push({ code: "WORDS_DIGITS_CONFLICT", severity: "warning", field });

  if (meta.confidence !== undefined && meta.confidence < LOW_CONFIDENCE_THRESHOLD)
    flags.push({ code: "LOW_CONFIDENCE", severity: "warning", actual: meta.confidence });

  return flags;
}

export const isBlocked = (flags: CheckFlag[]) => flags.some((f) => f.severity === "blocking");

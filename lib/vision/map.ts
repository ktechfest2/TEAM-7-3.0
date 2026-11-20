import { PartyCode, type CheckMeta, type ExtractedResult, type PartyScores, type VisionExtraction } from "../schemas";
import { normalizePuCode } from "../directory";
import type { CheckFlag } from "../schemas";
import { wordsToNumber } from "./words";

type Figure = VisionExtraction["registered_voters"];

/** "A.D.C" → "ADC". Null when the printed name can't be turned into a party code. */
export function toPartyCode(printed: string): string | null {
  const code = printed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PartyCode.safeParse(code).success ? code : null;
}

/**
 * Converts the model's transcription into the stored result shape plus the metadata the
 * rule checks need. All comparing happens here, in plain code: the model only transcribes.
 */
export function fromVision(v: VisionExtraction): { result: ExtractedResult; meta: CheckMeta } {
  const unreadable: string[] = [];
  const conflicts: string[] = [];
  const confidences = [v.confidence];

  const read = (field: string, f: Figure): number | null => {
    if (f.figures === null) {
      unreadable.push(field);
      return null;
    }
    confidences.push(f.confidence);
    const fromWords = wordsToNumber(f.words);
    if (fromWords !== null && fromWords !== f.figures) conflicts.push(field);
    return f.figures;
  };

  const result: ExtractedResult = {
    registered: read("registered", v.registered_voters),
    accredited: read("accredited", v.accredited_voters),
    rejected: read("rejected", v.rejected_ballots),
    total_valid: read("total_valid", v.total_valid_votes),
    votes_cast: read("votes_cast", v.total_votes_cast),
    party_scores: {},
  };

  const party_scores: PartyScores = {};
  const seen = new Set<string>();
  for (const row of v.party_scores) {
    const code = toPartyCode(row.party);
    // An unusable name or a repeated party is ambiguous: don't guess, don't merge.
    if (code === null || seen.has(code)) {
      unreadable.push((code ?? row.party).slice(0, 40));
      continue;
    }
    seen.add(code);
    const votes = read(code, row);
    if (votes !== null) party_scores[code] = votes;
  }
  result.party_scores = party_scores;

  return {
    result,
    meta: {
      confidence: Math.min(...confidences),
      unreadable,
      conflicts,
      isResultSheet: v.is_result_sheet,
      legible: v.legible,
    },
  };
}

/** A result sheet must have a readable PU code that matches the witness's selected unit. */
export function unitCodeFlag(v: VisionExtraction, chosenCode: string): CheckFlag | null {
  if (!v.is_result_sheet) return null;
  const rawOnSheet = v.unit.polling_unit_code?.trim();
  const onSheet = rawOnSheet ? normalizePuCode(rawOnSheet) : null;
  const chosen = normalizePuCode(chosenCode);
  if (!onSheet || !chosen) return { code: "UNIT_CODE_UNREADABLE", severity: "blocking", field: rawOnSheet || undefined };
  return onSheet !== chosen ? { code: "UNIT_CODE_MISMATCH", severity: "blocking", field: onSheet } : null;
}

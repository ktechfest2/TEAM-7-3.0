/**
 * Shared types and zod schemas for client and server.
 * DB row types come from `supabase gen types` (lib/database.types.ts); this file holds
 * the JSONB shapes, API payloads, and the vision-model contract.
 */
import { z } from "zod";
import { Election } from "./elections";

// ── Primitives ─────────────────────────────────────────────────────────
export const PartyCode = z.string().regex(/^[A-Z0-9]{1,8}$/);
const Count = z.number().int().min(0).max(100_000);

// ── Vision contract: the EXACT JSON the model must return ──────────────
// Sent to the API as the structured-output schema, then re-validated here with safeParse
// (the API's schema subset drops checks like max/regex). The model only transcribes: party
// names come back as printed, scores in figures AND words, each with its own confidence.
// lib/vision/map.ts turns this into the stored shape (party codes, unreadable fields,
// words/figures conflicts). Key order follows the sheet, top to bottom, so the model reads
// in that order.
const Confidence = z.number().min(0).max(1);
const Written = z.string().max(120).nullable();
const Figure = z.object({
  figures: Count.nullable(), // the digits as written; null if unreadable or blank
  words: Written, // the words as written; null if not written or unreadable
  confidence: Confidence,
});
export const VisionExtraction = z.object({
  is_result_sheet: z.boolean(),
  form_type: z.enum(["EC8A", "OTHER", "UNKNOWN"]),
  legible: z.boolean(),
  unit: z.object({
    state: Written,
    lga: Written,
    ward: Written,
    polling_unit_name: Written,
    polling_unit_code: Written,
  }),
  registered_voters: Figure,
  accredited_voters: Figure,
  party_scores: z.array(Figure.extend({ party: z.string().max(40) })).max(30),
  rejected_ballots: Figure,
  total_valid_votes: Figure,
  total_votes_cast: Figure,
  confidence: Confidence, // overall
  notes: z.string().max(1000),
});
export type VisionExtraction = z.infer<typeof VisionExtraction>;

// ── Domain shapes (extracted_results columns, unit_results.agreed_scores) ──
export const PartyScores = z.record(PartyCode, Count);
export type PartyScores = z.infer<typeof PartyScores>;

export const ExtractedResult = z.object({
  registered: Count.nullable(),
  accredited: Count.nullable(),
  rejected: Count.nullable(),
  total_valid: Count.nullable(),
  votes_cast: Count.nullable(),
  party_scores: PartyScores,
});
export type ExtractedResult = z.infer<typeof ExtractedResult>;

// ── Rule checks (plain code). Codes map to i18n keys; wording never accuses anyone. ──
export const CheckCode = z.enum([
  "VOTES_CAST_GT_ACCREDITED", // votes cast > accredited
  "ACCREDITED_GT_REGISTERED", // accredited > registered
  "PARTY_SUM_NE_TOTAL_VALID", // sum(parties) ≠ total valid
  "VALID_PLUS_REJECTED_NE_CAST", // valid + rejected ≠ votes cast
  "MISSING_FIELD", // a required figure was unreadable
  "WORDS_DIGITS_CONFLICT", // figure in words ≠ figure in digits
  "LOW_CONFIDENCE", // model confidence below threshold
  "NOT_A_RESULT_SHEET",
  "SHEET_ILLEGIBLE", // too blurry, cropped or dark to read
  "UNIT_CODE_MISMATCH", // the PU code written on the sheet is not the unit the witness chose
]);
export type CheckCode = z.infer<typeof CheckCode>;

/**
 * blocking: the reading itself is unusable (unreadable / not a result sheet), so it
 *           can't count toward verification.
 * warning:  the reading is usable, but the numbers on the sheet look impossible.
 *           Two witnesses can still verify WHAT THE WALL SAYS; the warning stays visible.
 */
export const CheckFlag = z.object({
  code: CheckCode,
  severity: z.enum(["blocking", "warning"]),
  field: z.string().optional(),
  expected: z.number().optional(),
  actual: z.number().optional(),
});
export type CheckFlag = z.infer<typeof CheckFlag>;
export const CheckFlags = z.array(CheckFlag);

export type CheckMeta = {
  confidence?: number;
  unreadable?: string[];
  conflicts?: string[];
  isResultSheet?: boolean;
  legible?: boolean;
};

// ── Consensus ──────────────────────────────────────────────────────────
export type UnitStatus = "pending" | "verified" | "flagged";
export type Reading = { userId: string; result: ExtractedResult; flags: CheckFlag[] };
export type Consensus = {
  status: UnitStatus;
  agreed: ExtractedResult | null;
  witnessCount: number;
};

// ── Diff ───────────────────────────────────────────────────────────────
export type PartyDiff = {
  party: string;
  wall_votes: number;
  announced_votes: number;
  difference: number; // announced − wall
};

// ── API payloads (validated in route handlers) ─────────────────────────
export const ExtractRequest = z.object({ photoId: z.uuid(), reread: z.boolean().optional() });

export const CompareQuery = z.object({ code: z.string().min(1).max(40), election: Election });

export const CollationInput = z.object({
  level: z.enum(["ward", "lga", "state", "national"]),
  election: Election,
  areaCode: z.string().min(1).max(40),
  unitId: z.uuid().nullable(),
  partyScores: PartyScores,
  source: z.string().min(1).max(80),
  announcedAt: z.iso.datetime(),
});

export const CheckInInput = z.object({
  unitId: z.uuid(),
  officialsArrived: z.boolean(),
  bvasPresent: z.boolean(),
  materialsOk: z.boolean(),
  openedAt: z.iso.datetime().nullable(),
  notes: z.string().max(500).optional(),
});

export const MoveFlagInput = z.object({
  unitId: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ── Offline queue item (IndexedDB, browser only) ───────────────────────
export type QueuedCapture = {
  localId: string;
  unitId: string; // "" when typed in offline by code: resolved from unitCode before upload
  unitCode?: string;
  election?: Election; // missing on captures queued before elections existed = presidential
  // The photo (exactly the bytes that were hashed) lives in its own store: see getPhoto().
  sha256: string;
  capturedAt: string; // ISO, device clock
  // draft: taken offline without choosing a polling unit; waits for the witness to finish it.
  status: "draft" | "queued" | "uploading" | "uploaded" | "extracting" | "done" | "failed";
  attempts: number;
  photoId?: string;
  error?: string;
};

// ── Public unit page timeline ──────────────────────────────────────────
export type TimelineEvent =
  | { kind: "check_in"; at: string; officialsArrived: boolean; bvasPresent: boolean; materialsOk: boolean }
  | { kind: "photo"; at: string; uploadedAt: string; sha256: string; hashVerified: boolean | null; witness: number }
  | { kind: "verified"; at: string; witnessCount: number }
  | { kind: "collation"; at: string; level: string; matches: boolean }
  | { kind: "packet"; at: string; url: string };

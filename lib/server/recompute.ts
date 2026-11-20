import "server-only";
import type { Election } from "../elections";
import { computeConsensus, readingKey, SOLO_EC8_WAIT_MS } from "../rules/consensus";
import { diffScores } from "../rules/diff";
import { CheckFlags, ExtractedResult, PartyScores, VisionExtraction, type Reading } from "../schemas";
import { adminClient } from "../supabase/admin";
import { LOW_CONFIDENCE_THRESHOLD } from "../rules/checks";
import { unitCodeFlag } from "../vision/map";

type PhotoRow = {
  user_id: string;
  uploaded_at: string;
  hash_verified: boolean | null;
  polling_units: { code: string } | { code: string }[] | null;
  extracted_results: (ExtractedResult & { check_flags: unknown; ai_confidence: number | null; raw: unknown }) | (ExtractedResult & { check_flags: unknown; ai_confidence: number | null; raw: unknown })[] | null;
};

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Re-derives one election's status at a unit from all its readings, then refreshes its discrepancies. */
export async function recomputeUnit(unitId: string, election: Election) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("result_photos")
    .select("user_id, uploaded_at, hash_verified, polling_units(code), extracted_results(registered, accredited, rejected, total_valid, votes_cast, party_scores, check_flags, ai_confidence, raw)")
    .eq("unit_id", unitId)
    .eq("election", election)
    .order("uploaded_at")
    .returns<PhotoRow[]>();
  if (error) throw new Error(error.message);

  const readings: Reading[] = data.flatMap((row) => {
    const x = one(row.extracted_results);
    // Photos whose server re-hash didn't match are never counted.
    if (!x || row.hash_verified === false) return [];
    const { check_flags, ...rest } = x;
    const storedFlags = CheckFlags.parse(check_flags);
    const vision = VisionExtraction.safeParse(x.raw).data;
    const unit = one(row.polling_units);
    const codeFlag = vision && unit ? unitCodeFlag(vision, unit.code) : null;
    const flags = storedFlags.filter((flag) => flag.code !== "UNIT_CODE_MISMATCH" && flag.code !== "UNIT_CODE_UNREADABLE");
    if (codeFlag) flags.push(codeFlag);
    const clearEc8 = row.hash_verified === true
      && !!vision
      && vision.is_result_sheet
      && vision.form_type === "EC8A"
      && vision.legible
      && (x.ai_confidence ?? 0) >= LOW_CONFIDENCE_THRESHOLD
      && !codeFlag
      && !flags.some((flag) => flag.severity === "blocking" || ["LOW_CONFIDENCE", "UNIT_CODE_MISMATCH", "WORDS_DIGITS_CONFLICT"].includes(flag.code));
    return [{ userId: row.user_id, result: ExtractedResult.parse(rest), flags, submittedAt: row.uploaded_at, clearEc8 }];
  });

  const c = computeConsensus(readings);
  const { data: prev } = await admin
    .from("unit_results")
    .select("status, agreed_scores, verified_at")
    .eq("unit_id", unitId)
    .eq("election", election)
    .maybeSingle();

  // Keep the original verified_at if the agreed result hasn't changed.
  const unchanged = prev?.status === "verified" && c.agreed && readingKey(prev.agreed_scores) === readingKey(c.agreed);
  const now = new Date().toISOString();
  const { error: upErr } = await admin.from("unit_results").upsert(
    {
      unit_id: unitId,
      election,
      status: c.status,
      agreed_scores: c.agreed,
      witness_count: c.witnessCount,
      verified_at: c.status === "verified" ? (unchanged ? prev.verified_at : now) : null,
      updated_at: now,
    },
    { onConflict: "unit_id,election" },
  );
  if (upErr) throw new Error(upErr.message);

  await recomputeDiscrepancies(unitId, election, c.status === "verified" ? c.agreed : null);
  return c;
}

let lastMaturitySweep = 0;
/**
 * Lazily advance eligible reports whose five-hour window has elapsed. The live feed
 * polls this route, so a deployed demo updates without requiring a separate worker.
 * The sweep is throttled per server instance and bounded to the latest 500 uploads.
 */
export async function recomputeMaturedUnits() {
  const now = Date.now();
  if (now - lastMaturitySweep < 60_000) return;
  lastMaturitySweep = now;
  const admin = adminClient();
  const { data, error } = await admin.from("result_photos")
    .select("unit_id, election, uploaded_at, extracted_results!inner(id)")
    .eq("hash_verified", true)
    .lt("uploaded_at", new Date(now - SOLO_EC8_WAIT_MS).toISOString())
    .order("uploaded_at", { ascending: false })
    .limit(500);
  if (error) {
    lastMaturitySweep = 0;
    throw new Error(error.message);
  }
  const targets = new Map<string, Election>();
  for (const row of data ?? []) targets.set(`${row.unit_id}:${row.election}`, row.election as Election);
  for (const key of [...targets.keys()].slice(0, 50)) {
    const unitId = key.slice(0, key.lastIndexOf(":"));
    await recomputeUnit(unitId, targets.get(key)!);
  }
}

/**
 * Rebuilds the discrepancy rows for a unit: verified wall result vs every collation line for it.
 * Pass `agreed` if you already have it; otherwise it is loaded.
 */
export async function recomputeDiscrepancies(unitId: string, election: Election, agreed?: ExtractedResult | null) {
  const admin = adminClient();
  if (agreed === undefined) {
    const { data } = await admin
      .from("unit_results")
      .select("status, agreed_scores")
      .eq("unit_id", unitId)
      .eq("election", election)
      .maybeSingle();
    agreed = data?.status === "verified" ? ExtractedResult.parse(data.agreed_scores) : null;
  }

  const del = await admin.from("discrepancies").delete().eq("unit_id", unitId).eq("election", election);
  if (del.error) throw new Error(del.error.message);
  if (!agreed) return;

  const { data: cols, error } = await admin
    .from("collation_results")
    .select("id, party_scores")
    .eq("unit_id", unitId)
    .eq("election", election);
  if (error) throw new Error(error.message);

  const rows = cols.flatMap((col) =>
    diffScores(agreed.party_scores, PartyScores.parse(col.party_scores))
      .filter((d) => d.difference !== 0)
      .map((d) => ({ unit_id: unitId, election, collation_id: col.id, party: d.party, wall_votes: d.wall_votes, announced_votes: d.announced_votes })),
  );
  if (rows.length) {
    const ins = await admin.from("discrepancies").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
}

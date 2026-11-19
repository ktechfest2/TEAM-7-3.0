import "server-only";
import type { Election } from "../elections";
import { computeConsensus, readingKey } from "../rules/consensus";
import { diffScores } from "../rules/diff";
import { CheckFlags, ExtractedResult, PartyScores, type Reading } from "../schemas";
import { adminClient } from "../supabase/admin";

type PhotoRow = {
  user_id: string;
  hash_verified: boolean | null;
  extracted_results: (ExtractedResult & { check_flags: unknown }) | (ExtractedResult & { check_flags: unknown })[] | null;
};

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Re-derives one election's status at a unit from all its readings, then refreshes its discrepancies. */
export async function recomputeUnit(unitId: string, election: Election) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("result_photos")
    .select("user_id, hash_verified, extracted_results(registered, accredited, rejected, total_valid, votes_cast, party_scores, check_flags)")
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
    return [{ userId: row.user_id, result: ExtractedResult.parse(rest), flags: CheckFlags.parse(check_flags) }];
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

import "server-only";
import type { UnitStatus } from "@/lib/schemas";
import { publicClient } from "@/lib/supabase/server";
import type { Filter, UnitsPage, UnitsQuery } from "./shared";

type Row = { id: string; code: string; name: string; ward: string; lga: string; state: string; moved: boolean; is_simulated: boolean };
const COLUMNS = "id, code, name, ward, lga, state, moved, is_simulated";

type Ids = { verified: string[]; mismatch: string[] };

export async function loadUnits(query: UnitsQuery): Promise<UnitsPage> {
  const db = publicClient();
  const { election, q, state } = query;
  const pattern = q ? `%${q.replace(/[%_*,()]/g, " ")}%` : null;
  const search = pattern ? `code.ilike.${pattern},name.ilike.${pattern},ward.ilike.${pattern},lga.ilike.${pattern}` : null;

  /**
   * Verified and mismatched unit ids, read from the small results and discrepancies tables rather
   * than by scanning all ~176k polling units. Verified = a verified CounTrack result with no
   * mismatch against the announced figures; mismatch = the announced figures disagree.
   */
  async function loadIds(): Promise<Ids | null> {
    const embed = ", polling_units!inner(id)";
    let verifiedQ = db.from("unit_results").select(`unit_id${embed}`).eq("election", election).eq("status", "verified");
    let mismatchQ = db.from("discrepancies").select(`unit_id${embed}`).eq("election", election);
    verifiedQ = verifiedQ.eq("polling_units.is_simulated", false);
    mismatchQ = mismatchQ.eq("polling_units.is_simulated", false);
    if (search) {
      verifiedQ = verifiedQ.or(search, { referencedTable: "polling_units" });
      mismatchQ = mismatchQ.or(search, { referencedTable: "polling_units" });
    }
    if (state) {
      verifiedQ = verifiedQ.eq("polling_units.state", state);
      mismatchQ = mismatchQ.eq("polling_units.state", state);
    }
    const [verified, mismatch] = await Promise.all([verifiedQ.range(0, 9999), mismatchQ.range(0, 9999)]);
    if (verified.error || mismatch.error) {
      console.error("unit tile ids failed", (verified.error ?? mismatch.error)?.message);
      return null;
    }
    const idsOf = (rows: unknown) => (rows as { unit_id: string }[]).map((r) => r.unit_id);
    const mismatched = new Set(idsOf(mismatch.data));
    return { verified: [...new Set(idsOf(verified.data))].filter((id) => !mismatched.has(id)), mismatch: [...mismatched] };
  }

  /** Polling units narrowed to the search, the state and (optionally) a set of ids. */
  function units(only: string[] | null, opts: { head?: boolean } = {}) {
    let b = db.from("polling_units").select(COLUMNS, { count: "exact", head: opts.head });
    b = b.eq("is_simulated", false);
    if (only) b = b.in("id", only);
    if (search) b = b.or(search);
    if (state) b = b.eq("state", state);
    return b;
  }

  const idsReq = loadIds();
  const statesReq = db.from("polling_unit_directory_states").select("name").order("name");

  // A status filter lists exactly the ids behind its tile, so those come first (they are quick).
  let only: string[] | null = null;
  if (query.status !== "all") {
    const ids = await idsReq;
    if (!ids) throw new Error("Could not load verification results. Try again.");
    only = ids[query.status];
  }

  type ListResult = { data: Row[] | null; count: number | null; error: { code?: string; message: string } | null };
  const list = async (pageNo: number): Promise<ListResult> =>
    only?.length === 0
      ? { data: [], count: 0, error: null }
      : units(only)
          .order(query.sort)
          .order("code")
          .range((pageNo - 1) * query.size, pageNo * query.size - 1)
          .overrideTypes<Row[], { merge: false }>();

  // With no status filter the list's own count is the "all" tile, so skip the duplicate scan.
  const allReq = () => (query.status === "all" ? Promise.resolve({ count: null, error: null }) : units(null, { head: true }));
  // A text search scans every unit until the trigram indexes exist (migration 20261119000400), so
  // the list goes first and the "all" count after, instead of both competing for the same timeout.
  const [first, allRes] = pattern
    ? await (async () => { const l = await list(query.page); return [l, await allReq()] as const; })()
    : await Promise.all([list(query.page), allReq()]);
  const [tileIds, states] = await Promise.all([idsReq, statesReq]);

  let page = first;
  let pageNo = query.page;
  // Past the last page (an old link, or the total shrank): show the last page instead.
  if (page.error?.code === "PGRST103") {
    const n = (await units(only, { head: true })).count ?? 0;
    pageNo = Math.max(1, Math.ceil(n / query.size));
    page = await list(pageNo);
  }
  if (page.error) throw new Error(page.error.message);
  // The "all" count is a nice-to-have: a slow one shows "—" rather than failing the page.
  const all = query.status === "all" ? page.count : allRes.error ? null : allRes.count;

  // Witness counts and mismatches for just the units on this page.
  const rows = page.data ?? [];
  const ids = rows.map((r) => r.id);
  const [results, diffs] = ids.length
    ? await Promise.all([
        db.from("unit_results").select("unit_id, status, witness_count").eq("election", election).in("unit_id", ids),
        db.from("discrepancies").select("unit_id").eq("election", election).in("unit_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const resultRows = (results.data ?? []) as { unit_id: string; status: UnitStatus; witness_count: number }[];
  const resultBy = new Map(resultRows.map((r) => [r.unit_id, r]));
  const diffCount = new Map<string, number>();
  for (const d of (diffs.data ?? []) as { unit_id: string }[]) diffCount.set(d.unit_id, (diffCount.get(d.unit_id) ?? 0) + 1);

  const counts: Record<Filter, number | null> = {
    all,
    verified: tileIds ? tileIds.verified.length : null,
    mismatch: tileIds ? tileIds.mismatch.length : null,
  };

  return {
    units: rows.map((u) => {
      const r = resultBy.get(u.id);
      return {
        id: u.id, code: u.code, name: u.name, ward: u.ward, lga: u.lga, state: u.state,
        moved: u.moved, simulated: u.is_simulated,
        status: r?.status ?? "pending",
        witnesses: r?.witness_count ?? 0,
        mismatches: diffCount.get(u.id) ?? 0,
      };
    }),
    total: page.count ?? 0,
    page: pageNo,
    counts,
    states: (states.data ?? []).map((s) => s.name as string),
  };
}

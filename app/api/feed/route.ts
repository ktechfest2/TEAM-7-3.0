import { connection, NextResponse } from "next/server";
import { apiT } from "@/lib/i18n/api";
import { Election } from "@/lib/elections";
import type { FeedEvent, FeedUnit } from "@/lib/feed";
import { adminClient } from "@/lib/supabase/admin";
import { recomputeMaturedUnits } from "@/lib/server/recompute";
import { publicClient } from "@/lib/supabase/server";

const LIMIT = 15;
const UNIT = "polling_units!inner(code, name, ward, lga, state, is_simulated)";
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

type PhotoRow = { id: string; uploaded_at: string; election: Election; image_url: string; sha256_hash: string; polling_units: FeedUnit | FeedUnit[] | null; extracted_results: { id: string } | { id: string }[] | null };
type ResultRow = { id: string; updated_at: string; verified_at: string | null; status: "verified" | "flagged"; election: Election; witness_count: number; polling_units: FeedUnit | FeedUnit[] | null };
type DiffRow = { id: string; detected_at: string; election: Election; party: string; wall_votes: number; announced_votes: number; polling_units: FeedUnit | FeedUnit[] | null };
type IncidentFeedRow = { unit_id: string; incident_code: "VUB" | "VIO" | "MSB" | "BOG" | "INT"; report_count: number; demo_count: number; sandbox_count: number; latest_received_at: string; code: string; name: string; ward: string; lga: string; state: string };

/** Latest public activity across all units: photos sealed, units verified or needing review, mismatches. */
export async function GET(req: Request) {
  const tr = apiT(req);
  // Always per request: never prerendered at build time (it reads the URL and refreshes results).
  await connection();
  try {
    await recomputeMaturedUnits();
  } catch (error) {
    console.error("matured result refresh failed", error);
  }
  const raw = new URL(req.url).searchParams.get("election");
  const election = raw && raw !== "all" ? Election.safeParse(raw).data : undefined;
  if (raw && raw !== "all" && !election) return NextResponse.json({ error: "Unknown election" }, { status: 400 });

  const db = publicClient();
  let photosQ = db.from("result_photos").select(`id, uploaded_at, election, image_url, sha256_hash, ${UNIT}, extracted_results(id)`);
  let resultsQ = db.from("unit_results").select(`id, updated_at, verified_at, status, election, witness_count, ${UNIT}`).in("status", ["verified", "flagged"]);
  let diffsQ = db.from("discrepancies").select(`id, detected_at, election, party, wall_votes, announced_votes, ${UNIT}`);
  photosQ = photosQ.eq("polling_units.is_simulated", false);
  resultsQ = resultsQ.eq("polling_units.is_simulated", false);
  diffsQ = diffsQ.eq("polling_units.is_simulated", false);
  if (election) {
    photosQ = photosQ.eq("election", election);
    resultsQ = resultsQ.eq("election", election);
    diffsQ = diffsQ.eq("election", election);
  }

  const [photos, results, diffs, incidents, hiddenRes] = await Promise.all([
    photosQ.order("uploaded_at", { ascending: false }).limit(LIMIT).returns<PhotoRow[]>(),
    resultsQ.order("updated_at", { ascending: false }).limit(LIMIT).returns<ResultRow[]>(),
    diffsQ.order("detected_at", { ascending: false }).limit(LIMIT).returns<DiffRow[]>(),
    // This SECURITY DEFINER RPC only returns grouped, non-identifying public counts.
    adminClient().rpc("incident_feed"),
    // Items an admin removed from the feed (server-only table).
    adminClient().from("feed_hidden").select("event_id, hidden_at").returns<{ event_id: string; hidden_at: string }[]>(),
  ]);
  const failed = photos.error ?? results.error ?? diffs.error;
  if (failed) {
    console.error("feed failed", failed.message);
    return NextResponse.json({ error: tr("api.feedUnavailable") }, { status: 503 });
  }

  const events: FeedEvent[] = [];
  for (const p of photos.data ?? []) {
    const unit = one(p.polling_units);
    if (unit) events.push({ kind: "photo", id: `p-${p.id}`, at: p.uploaded_at, election: p.election, unit, photoId: p.id, image: p.image_url, hash: p.sha256_hash, read: !!one(p.extracted_results) });
  }
  for (const r of results.data ?? []) {
    const unit = one(r.polling_units);
    if (unit) events.push({ kind: r.status, id: `r-${r.id}`, at: r.status === "verified" ? (r.verified_at ?? r.updated_at) : r.updated_at, election: r.election, unit, witnesses: r.witness_count });
  }
  for (const d of diffs.data ?? []) {
    const unit = one(d.polling_units);
    if (unit) events.push({ kind: "mismatch", id: `d-${d.id}`, at: d.detected_at, election: d.election, unit, party: d.party, wall: d.wall_votes, announced: d.announced_votes });
  }
  if (incidents.error) {
    // Keep the result activity feed working if the incident aggregation migration is not applied yet.
    console.error("incident feed unavailable", incidents.error.message);
  } else {
    for (const incident of (incidents.data ?? []) as IncidentFeedRow[]) {
      events.push({
        kind: "incident",
        id: `i-${incident.unit_id}-${incident.incident_code}`,
        at: incident.latest_received_at,
        unit: { code: incident.code, name: incident.name, ward: incident.ward, lga: incident.lga, state: incident.state },
        incidentCode: incident.incident_code,
        reportCount: Number(incident.report_count),
        source: Number(incident.demo_count) === Number(incident.report_count)
          ? "demo"
          : Number(incident.sandbox_count) === Number(incident.report_count) ? "at_sandbox" : "mixed",
      });
    }
  }
  // A hidden item stays hidden until it has newer activity than when it was hidden.
  if (hiddenRes.error) console.error("feed_hidden unavailable", hiddenRes.error.message);
  const hiddenAt = new Map((hiddenRes.data ?? []).map((h) => [h.event_id, Date.parse(h.hidden_at)]));
  const visible = events.filter((e) => !(Date.parse(e.at) <= (hiddenAt.get(e.id) ?? -Infinity)));
  visible.sort((a, b) => b.at.localeCompare(a.at));
  // Keep the newest general activity plus every grouped incident entry in the response,
  // so the browser can retain the incident view for offline use.
  const activity = visible.filter((event) => event.kind !== "incident").slice(0, 30);
  const incidentEvents = visible.filter((event) => event.kind === "incident");
  return NextResponse.json({ events: [...activity, ...incidentEvents].sort((a, b) => b.at.localeCompare(a.at)) }, { headers: { "Cache-Control": "no-store" } });
}

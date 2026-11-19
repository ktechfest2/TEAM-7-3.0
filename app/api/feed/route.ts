import { NextResponse } from "next/server";
import { Election } from "@/lib/elections";
import type { FeedEvent, FeedUnit } from "@/lib/feed";
import { publicClient } from "@/lib/supabase/server";

const LIMIT = 15;
const UNIT = "polling_units(code, name, ward, lga, state)";
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

type PhotoRow = { id: string; uploaded_at: string; election: Election; image_url: string; sha256_hash: string; polling_units: FeedUnit | FeedUnit[] | null; extracted_results: { id: string } | { id: string }[] | null };
type ResultRow = { id: string; updated_at: string; verified_at: string | null; status: "verified" | "flagged"; election: Election; witness_count: number; polling_units: FeedUnit | FeedUnit[] | null };
type DiffRow = { id: string; detected_at: string; election: Election; party: string; wall_votes: number; announced_votes: number; polling_units: FeedUnit | FeedUnit[] | null };

/** Latest public activity across all units: photos sealed, units verified or needing review, mismatches. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("election");
  const election = raw && raw !== "all" ? Election.safeParse(raw).data : undefined;
  if (raw && raw !== "all" && !election) return NextResponse.json({ error: "Unknown election" }, { status: 400 });

  const db = publicClient();
  let photosQ = db.from("result_photos").select(`id, uploaded_at, election, image_url, sha256_hash, ${UNIT}, extracted_results(id)`);
  let resultsQ = db.from("unit_results").select(`id, updated_at, verified_at, status, election, witness_count, ${UNIT}`).in("status", ["verified", "flagged"]);
  let diffsQ = db.from("discrepancies").select(`id, detected_at, election, party, wall_votes, announced_votes, ${UNIT}`);
  if (election) {
    photosQ = photosQ.eq("election", election);
    resultsQ = resultsQ.eq("election", election);
    diffsQ = diffsQ.eq("election", election);
  }

  const [photos, results, diffs] = await Promise.all([
    photosQ.order("uploaded_at", { ascending: false }).limit(LIMIT).returns<PhotoRow[]>(),
    resultsQ.order("updated_at", { ascending: false }).limit(LIMIT).returns<ResultRow[]>(),
    diffsQ.order("detected_at", { ascending: false }).limit(LIMIT).returns<DiffRow[]>(),
  ]);
  const failed = photos.error ?? results.error ?? diffs.error;
  if (failed) {
    console.error("feed failed", failed.message);
    return NextResponse.json({ error: "The feed is unavailable right now" }, { status: 503 });
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
  events.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ events: events.slice(0, 30) }, { headers: { "Cache-Control": "no-store" } });
}

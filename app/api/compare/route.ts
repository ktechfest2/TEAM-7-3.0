import { connection, NextResponse } from "next/server";
import { apiT } from "@/lib/i18n/api";
import { diffScores } from "@/lib/rules/diff";
import { CompareQuery, ExtractedResult, PartyScores } from "@/lib/schemas";
import { recomputeUnit } from "@/lib/server/recompute";
import { publicClient } from "@/lib/supabase/server";

/**
 * For one unit and election: the verified wall result vs the latest announced figure,
 * party by party. The same comparison the discrepancy check stores.
 */
export async function GET(req: Request) {
  const tr = apiT(req);
  await connection(); // per request, never prerendered at build time
  const sp = new URL(req.url).searchParams;
  const query = CompareQuery.safeParse({ code: sp.get("code"), election: sp.get("election") ?? "presidential" });
  if (!query.success) return NextResponse.json({ error: tr("api.chooseUnit") }, { status: 400 });
  const { code, election } = query.data;

  const db = publicClient();
  const { data: unit } = await db.from("polling_units").select("id, code, name, ward, lga, state").eq("code", code).maybeSingle();
  if (!unit) return NextResponse.json({ error: tr("api.unitNotFound") }, { status: 404 });

  try {
    await recomputeUnit(unit.id, election);
  } catch (error) {
    console.error("comparison refresh failed", error);
    return NextResponse.json({ error: tr("api.compareUnavailable") }, { status: 503 });
  }

  const [res, col] = await Promise.all([
    db.from("unit_results").select("status, witness_count, agreed_scores").eq("unit_id", unit.id).eq("election", election).maybeSingle(),
    db.from("collation_results").select("party_scores, source, announced_at").eq("unit_id", unit.id).eq("election", election)
      .order("announced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (res.error || col.error) return NextResponse.json({ error: tr("api.compareUnavailable") }, { status: 503 });

  const status = res.data?.status ?? "pending";
  const wall = status === "verified" ? ExtractedResult.safeParse(res.data?.agreed_scores).data ?? null : null;
  const announced = col.data ? PartyScores.safeParse(col.data.party_scores).data ?? null : null;

  return NextResponse.json({
    unit,
    status,
    witnesses: res.data?.witness_count ?? 0,
    announcedSource: col.data ? { source: col.data.source, at: col.data.announced_at } : null,
    diffs: wall && announced ? diffScores(wall.party_scores, announced) : null,
    wall: wall?.party_scores ?? null,
    announced,
  });
}

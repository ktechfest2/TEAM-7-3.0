import { NextResponse } from "next/server";
import { CollationInput } from "@/lib/schemas";
import { recomputeDiscrepancies } from "@/lib/server/recompute";
import { adminClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Saves a collated (announced) figure for a unit, then recomputes its discrepancies. */
export async function POST(req: Request) {
  const body = CollationInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Check the figures and try again", 400);
  if (!body.data.unitId) return fail("Choose a polling unit", 400);

  // No login: anyone can enter an announced figure. Each line records which phone entered
  // it (anonymous session) and its source, and it is only ever compared, never trusted.
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("This phone has no session yet. Try again.", 401);

  const admin = adminClient();
  const { data: unit } = await admin.from("polling_units").select("id, code, ward").eq("id", body.data.unitId).maybeSingle();
  if (!unit) return fail("Polling unit not found", 404);

  const ins = await admin.from("collation_results").insert({
    level: body.data.level,
    election: body.data.election,
    area_code: body.data.level === "ward" ? unit.ward : body.data.areaCode,
    unit_id: unit.id,
    party_scores: body.data.partyScores,
    source: body.data.source,
    announced_at: body.data.announcedAt,
    entered_by: user.id,
    is_simulated: true, // everything entered in this demo is simulated
  });
  if (ins.error) return fail(ins.error.message, 500);

  await recomputeDiscrepancies(unit.id, body.data.election);
  return NextResponse.json({ ok: true, unitCode: unit.code });
}

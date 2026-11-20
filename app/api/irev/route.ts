import { connection, NextResponse } from "next/server";
import { Election } from "@/lib/elections";
import { getElections, getLgas, getUnit, getUnits, getWards, IREV_SOURCE, IrevError, irevMessage } from "@/lib/irev/client";
import { apiT } from "@/lib/i18n/api";
import { IREV_ID } from "@/lib/irev/map";
import { IREV_STATES } from "@/lib/irev/states";

const LEVELS = ["states", "elections", "lgas", "wards", "units", "unit"] as const;
type Level = (typeof LEVELS)[number];
const STATE_CODE = /^\d{2}$/;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * CounTrack's API over INEC's IReV, one call per level instead of IReV's click-through:
 *
 *   ?level=states
 *   ?level=elections&election=governorship&state=24[&date=2023-03-18]
 *   ?level=lgas&electionId=…&state=24
 *   ?level=wards&electionId=…&lga=…
 *   ?level=units&electionId=…&ward=…      (each unit carries its result-sheet documentUrl)
 *   ?level=unit&electionId=…&pu=…
 *
 * `state` is the INEC state code (as in PU codes, FCT = 37). IReV ids are passed through as-is.
 */
export async function GET(req: Request) {
  await connection(); // per request, never prerendered at build time
  const sp = new URL(req.url).searchParams;
  const level = sp.get("level") as Level | null;
  if (!level || !LEVELS.includes(level)) return bad(`level must be one of ${LEVELS.join(", ")}`);
  if (level === "states") return NextResponse.json({ data: IREV_STATES, source: IREV_SOURCE });

  const ids: Record<string, string | null> = {};
  for (const key of ["electionId", "lga", "ward", "pu"]) {
    const v = sp.get(key);
    if (v !== null && !IREV_ID.test(v)) return bad(`${key} is not an IReV id`);
    ids[key] = v;
  }
  const state = sp.get("state");
  if (state !== null && !STATE_CODE.test(state)) return bad("state must be a two-digit INEC state code, e.g. 24");
  const need = (key: string, value: string | null) => (value ? null : bad(`${key} is required for level=${level}`));

  try {
    switch (level) {
      case "elections": {
        const election = Election.safeParse(sp.get("election"));
        if (!election.success) return bad("election must be one of " + Election.options.join(", "));
        const date = sp.get("date");
        if (date && !DATE.test(date)) return bad("date must be YYYY, YYYY-MM or YYYY-MM-DD");
        return ok(await getElections(election.data, state, date));
      }
      case "lgas":
        return need("electionId", ids.electionId) ?? need("state", state) ?? ok(await getLgas(ids.electionId!, state!));
      case "wards":
        return need("electionId", ids.electionId) ?? need("lga", ids.lga) ?? ok(await getWards(ids.electionId!, ids.lga!));
      case "units":
        return need("electionId", ids.electionId) ?? need("ward", ids.ward) ?? ok(await getUnits(ids.electionId!, ids.ward!));
      case "unit": {
        const missing = need("electionId", ids.electionId) ?? need("pu", ids.pu);
        if (missing) return missing;
        const { unit, election } = await getUnit(ids.electionId!, ids.pu!);
        return NextResponse.json({ data: unit, election, source: IREV_SOURCE });
      }
    }
  } catch (err) {
    if (!(err instanceof IrevError)) console.error("irev lookup failed", err);
    return bad(apiT(req)(irevMessage(err)), err instanceof IrevError ? err.status : 502);
  }
}

const ok = (data: unknown[]) => NextResponse.json({ data, source: IREV_SOURCE });

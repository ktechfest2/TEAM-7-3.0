import { connection, NextResponse } from "next/server";
import { apiT } from "@/lib/i18n/api";
import { publicClient } from "@/lib/supabase/server";

const SOURCE = "INEC CVR portal via the community-maintained nigeria-inec-geo snapshot";
const SOURCE_TAG = "INEC CVR portal via nigeria-inec-geo";
const CODE = /^\d{2}\/\d{2}\/\d{2}\/\d{3}$/;
const SAFE_FILTER = /^[\p{L}\p{N} .,'’&()/-]+$/u;
const SAFE_SEARCH = /^[\p{L}\p{N} /-]+$/u;

function normalizeCode(input: string): string | null {
  const compact = input.trim().replace(/\s/g, "");
  const packed = compact.padStart(9, "0");
  const parts = /^\d{8,9}$/.test(compact)
    ? [packed.slice(0, 2), packed.slice(2, 4), packed.slice(4, 6), packed.slice(6)]
    : compact.split(/[/-]+/).filter(Boolean);
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const code = `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2].padStart(2, "0")}/${parts[3].padStart(3, "0")}`;
  return CODE.test(code) ? code : null;
}

function safeFilter(value: string | null, name: string): string | null | Response {
  if (value === null || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length > 80 || !SAFE_FILTER.test(trimmed)) {
    return NextResponse.json({ error: `Invalid ${name} filter` }, { status: 400 });
  }
  return trimmed;
}

/** Public real-world directory API. Supports exact PVC PU code lookup and paginated text search. */
export async function GET(request: Request) {
  const tr = apiT(request);
  await connection(); // per request, never prerendered at build time
  const params = new URL(request.url).searchParams;
  const level = params.get("level");
  const rawCode = params.get("code");
  const query = params.get("q")?.trim() ?? "";
  if (level && !["states", "lgas", "wards", "units"].includes(level)) {
    return NextResponse.json({ error: "level must be states, lgas, wards, or units" }, { status: 400 });
  }
  if (rawCode && query) return NextResponse.json({ error: "Use either code or q, not both" }, { status: 400 });

  const code = rawCode ? normalizeCode(rawCode) : null;
  if (rawCode && !code) {
    return NextResponse.json({ error: "Send the full PU code, for example 01/02/03/004 or its 8–9 digit form" }, { status: 400 });
  }
  if (query.length > 80 || (query && !SAFE_SEARCH.test(query))) {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  const state = safeFilter(params.get("state"), "state");
  const lga = safeFilter(params.get("lga"), "LGA");
  const ward = safeFilter(params.get("ward"), "ward");
  for (const result of [state, lga, ward]) if (result instanceof Response) return result;

  if (level && level !== "units") {
    if (rawCode || query || params.has("limit") || params.has("offset")) {
      return NextResponse.json({ error: "Hierarchy levels do not accept code, q, limit, or offset" }, { status: 400 });
    }
    if (level !== "states" && typeof state !== "string") {
      return NextResponse.json({ error: "state is required for this level" }, { status: 400 });
    }
    if (level === "wards" && typeof lga !== "string") {
      return NextResponse.json({ error: "lga is required for the wards level" }, { status: 400 });
    }

    const client = publicClient();
    let optionsQuery;
    if (level === "states") {
      optionsQuery = client.from("polling_unit_directory_states").select("code, name", { count: "exact" }).order("name");
    } else if (level === "lgas") {
      optionsQuery = client.from("polling_unit_directory_lgas").select("code, name", { count: "exact" }).eq("state_name", state).order("name");
    } else {
      optionsQuery = client.from("polling_unit_directory_wards").select("code, name", { count: "exact" }).eq("state_name", state).eq("lga_name", lga).order("name");
    }
    const { data: options, count: optionCount, error: optionsError } = await optionsQuery;
    if (optionsError) {
      console.error("polling unit hierarchy lookup failed", optionsError.message);
      return NextResponse.json({ error: tr("api.directoryUnavailable") }, { status: 503 });
    }
    return NextResponse.json({ data: options, pagination: { total: optionCount ?? 0 }, source: SOURCE });
  }

  if (level === "units" && (typeof state !== "string" || typeof lga !== "string" || typeof ward !== "string")) {
    return NextResponse.json({ error: "state, lga, and ward are required for the units level" }, { status: 400 });
  }
  if (level === "units" && (rawCode || query || params.has("offset"))) {
    return NextResponse.json({ error: "The units level uses state, lga, ward, and optional limit filters only" }, { status: 400 });
  }

  const maxLimit = level === "units" ? 500 : 100;
  const limitRaw = Number(params.get("limit") ?? (level === "units" ? 500 : 20));
  const offsetRaw = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > maxLimit || !Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > 1_000_000) {
    return NextResponse.json({ error: `limit must be 1–${maxLimit} and offset must be a non-negative integer` }, { status: 400 });
  }

  let queryBuilder = publicClient()
    .from("polling_units")
    .select(
      "id, code, name, location, ward, lga, state, lat, lng, directory_source, directory_snapshot, unit_results(status, witness_count), discrepancies(count)",
      { count: "exact" },
    )
    .eq("is_simulated", false)
    .eq("directory_is_current", true)
    .eq("directory_source", SOURCE_TAG);

  if (code) queryBuilder = queryBuilder.eq("code", code);
  if (query) {
    const pattern = `%${query.replace(/[%_*]/g, " ")}%`;
    queryBuilder = queryBuilder.or(`code.ilike.${pattern},name.ilike.${pattern},location.ilike.${pattern},ward.ilike.${pattern},lga.ilike.${pattern},state.ilike.${pattern}`);
  }
  if (typeof state === "string") queryBuilder = queryBuilder.ilike("state", state);
  if (typeof lga === "string") queryBuilder = queryBuilder.ilike("lga", lga);
  if (typeof ward === "string") queryBuilder = queryBuilder.ilike("ward", ward);

  const { data, count, error } = await queryBuilder
    .order("code")
    .range(offsetRaw, offsetRaw + limitRaw - 1);

  if (error) {
    console.error("polling unit lookup failed", error.message);
    return NextResponse.json({ error: tr("api.directoryUnavailable") }, { status: 503 });
  }

  const first = data?.[0] as { directory_snapshot?: string | null; directory_source?: string | null } | undefined;
  const body = {
    data,
    pagination: { limit: limitRaw, offset: offsetRaw, total: count ?? 0 },
    source: first?.directory_source ?? SOURCE,
    snapshot: first?.directory_snapshot ?? null,
    official_lookup: "https://cvr.inecnigeria.org/pu",
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" },
  });
}

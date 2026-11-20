import { connection, NextResponse } from "next/server";
import { apiT } from "@/lib/i18n/api";
import { publicClient } from "@/lib/supabase/server";

const SAFE = /^[\p{L}\p{N} .,'’&()/-]+$/u;

/** Type-ahead search over real directory units. */
export async function GET(req: Request) {
  const tr = apiT(req);
  await connection(); // per request, never prerendered at build time
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ units: [] });
  if (q.length > 80 || !SAFE.test(q)) return NextResponse.json({ error: tr("api.invalidSearch") }, { status: 400 });

  const pattern = `%${q.replace(/[%_*,()]/g, " ")}%`;
  const { data, error } = await publicClient()
    .from("polling_units")
    .select("id, code, name, ward, lga, state, is_simulated")
    .eq("is_simulated", false)
    .or(`code.ilike.${pattern},name.ilike.${pattern},ward.ilike.${pattern},lga.ilike.${pattern}`)
    .order("code")
    .limit(8);
  if (error) {
    console.error("unit search failed", error.message);
    return NextResponse.json({ error: tr("api.searchUnavailable") }, { status: 503 });
  }
  return NextResponse.json({ units: data });
}

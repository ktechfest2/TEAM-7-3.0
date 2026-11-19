import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/server";

const SAFE = /^[\p{L}\p{N} .,'’&()/-]+$/u;

/** Type-ahead search over every polling unit (real directory and simulated demo units). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ units: [] });
  if (q.length > 80 || !SAFE.test(q)) return NextResponse.json({ error: "Invalid search" }, { status: 400 });

  const pattern = `%${q.replace(/[%_*,()]/g, " ")}%`;
  const { data, error } = await publicClient()
    .from("polling_units")
    .select("id, code, name, ward, lga, state, is_simulated")
    .or(`code.ilike.${pattern},name.ilike.${pattern},ward.ilike.${pattern},lga.ilike.${pattern}`)
    .order("is_simulated", { ascending: false }) // demo units first: they have results to compare
    .order("code")
    .limit(8);
  if (error) {
    console.error("unit search failed", error.message);
    return NextResponse.json({ error: "Search is unavailable right now" }, { status: 503 });
  }
  return NextResponse.json({ units: data });
}

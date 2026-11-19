import { NextResponse } from "next/server";
import { PAGE_SIZE, type AreaResponse, type AreaUnitTuple } from "@/lib/directory";
import { publicClient } from "@/lib/supabase/server";

const SAFE = /^[\p{L}\p{N} .,'’&()/-]{1,80}$/u;
type Row = { id: string; code: string; name: string; location: string | null; lga: string; ward: string; directory_snapshot: string | null };

/** Every real polling unit in one state, compact, so a phone can work offline anywhere in that state. */
export async function GET(req: Request) {
  const state = new URL(req.url).searchParams.get("state")?.trim() ?? "";
  if (!SAFE.test(state)) return NextResponse.json({ error: "state is required" }, { status: 400 });

  const db = publicClient();
  const base = () =>
    db.from("polling_units").select("id, code, name, location, lga, ward, directory_snapshot", { count: "exact" })
      .eq("is_simulated", false)
      .eq("directory_is_current", true)
      .eq("state", state);

  const first = await base().order("code").range(0, PAGE_SIZE - 1).returns<Row[]>();
  if (first.error) return unavailable(first.error.message);
  const total = first.count ?? 0;
  if (!total) return NextResponse.json({ error: "Unknown state" }, { status: 404 });

  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE_SIZE) - 1 }, (_, i) =>
      base().order("code").range((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1).returns<Row[]>(),
    ),
  );
  const failed = rest.find((r) => r.error);
  if (failed?.error) return unavailable(failed.error.message);

  const rows = [first, ...rest].flatMap((r) => r.data ?? []);
  const units: AreaUnitTuple[] = rows.map((u) => [u.id, u.code, u.name, u.location, u.lga, u.ward]);
  const body: AreaResponse = { state, snapshot: rows[0]?.directory_snapshot ?? null, units };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}

function unavailable(message: string) {
  console.error("directory area failed", message);
  return NextResponse.json({ error: "Polling unit directory is temporarily unavailable" }, { status: 503 });
}

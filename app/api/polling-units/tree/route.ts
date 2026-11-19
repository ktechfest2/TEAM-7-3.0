import { NextResponse } from "next/server";
import { connection } from "next/server";
import { PAGE_SIZE, type DirectoryTree, type TreeResponse } from "@/lib/directory";
import { publicClient } from "@/lib/supabase/server";

type WardRow = { state_name: string; lga_name: string; name: string; directory_snapshot: string };

/** The whole State → LGA → Ward hierarchy in one response, so phones can cache it for offline use. */
export async function GET() {
  await connection();
  const db = publicClient();
  const count = await db.from("polling_unit_directory_wards").select("code", { count: "exact", head: true });
  if (count.error) return unavailable(count.error.message);

  const pages = Math.ceil((count.count ?? 0) / PAGE_SIZE);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      db
        .from("polling_unit_directory_wards")
        .select("state_name, lga_name, name, directory_snapshot")
        .order("state_code")
        .order("lga_code")
        .order("code")
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
        .returns<WardRow[]>(),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return unavailable(failed.error.message);

  const tree: DirectoryTree = {};
  let snapshot: string | null = null;
  for (const { data } of results)
    for (const w of data ?? []) {
      snapshot ??= w.directory_snapshot;
      ((tree[w.state_name] ??= {})[w.lga_name] ??= []).push(w.name);
    }
  for (const lgas of Object.values(tree)) for (const wards of Object.values(lgas)) wards.sort();

  const body: TreeResponse = { snapshot, tree };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}

function unavailable(message: string) {
  console.error("directory tree failed", message);
  return NextResponse.json({ error: "Polling unit directory is temporarily unavailable" }, { status: 503 });
}

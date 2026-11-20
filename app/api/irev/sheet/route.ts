import { connection } from "next/server";
import { getUnit, IrevError, irevMessage } from "@/lib/irev/client";
import { apiT } from "@/lib/i18n/api";
import { IREV_ID } from "@/lib/irev/map";

/** Only INEC's result-sheet storage. The URL comes from IReV, never from the caller. */
const ALLOWED_HOST = /(^|\.)amazonaws\.com$|(^|\.)inecelectionresults\.ng$/i;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/irev/sheet?electionId=…&pu=…[&download=1]
 * Streams one polling unit's uploaded result sheet (image or PDF) through CounTrack, so pages and
 * the vision reader can use it same-origin. Add download=1 to save it as a file.
 */
export async function GET(req: Request) {
  const tr = apiT(req);
  await connection(); // per request, never prerendered at build time
  const sp = new URL(req.url).searchParams;
  const electionId = sp.get("electionId") ?? "";
  const pu = sp.get("pu") ?? "";
  if (!IREV_ID.test(electionId) || !IREV_ID.test(pu)) return Response.json({ error: "electionId and pu must be IReV ids" }, { status: 400 });

  let url: string | null;
  let code: string;
  try {
    const { unit } = await getUnit(electionId, pu);
    url = unit.documentUrl;
    code = (unit.code ?? unit.irevCode ?? pu).replace(/[^\w-]+/g, "-");
  } catch (err) {
    const status = err instanceof IrevError ? err.status : 502;
    return Response.json({ error: tr(irevMessage(err)) }, { status });
  }
  if (!url) return Response.json({ error: tr("api.irev.noSheet") }, { status: 404 });
  if (!ALLOWED_HOST.test(new URL(url).hostname)) return Response.json({ error: tr("api.irev.sheetBad") }, { status: 502 });

  const upstream = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return Response.json({ error: tr("api.irev.sheetFailed") }, { status: 502 });
  const size = Number(upstream.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return Response.json({ error: tr("api.irev.sheetBad") }, { status: 502 });

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // Never serve HTML/script from CounTrack's origin, whatever the bucket returns.
  if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(type)) return Response.json({ error: tr("api.irev.sheetBad") }, { status: 502 });
  const ext = type.includes("pdf") ? "pdf" : type.includes("png") ? "png" : "jpg";
  const headers = new Headers({
    "content-type": type,
    "cache-control": "public, max-age=300",
    "x-irev-source": url,
    "x-content-type-options": "nosniff",
  });
  if (size) headers.set("content-length", String(size));
  if (sp.get("download") === "1") headers.set("content-disposition", `attachment; filename="irev-${code}.${ext}"`);
  return new Response(upstream.body, { headers });
}

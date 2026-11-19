import { NextResponse } from "next/server";
import { sha256Hex } from "@/lib/hash";
import { checkResult } from "@/lib/rules/checks";
import { parseElection } from "@/lib/elections";
import { isNetworkError, RETAKE_STATUS, RETRYABLE_STATUS } from "@/lib/network";
import { ExtractRequest } from "@/lib/schemas";
import { recomputeUnit } from "@/lib/server/recompute";
import { adminClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { ExtractionError, VISION_MODEL, extractFromImage } from "@/lib/vision/extract";
import { demoFixture } from "@/lib/vision/fixtures";
import { fromVision, unitCodeFlag } from "@/lib/vision/map";

export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Photo → server re-hash → vision model → zod → rule checks → save → recompute unit status. */
export async function POST(req: Request) {
  const body = ExtractRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Something went wrong sending this photo. We'll try again.", 400);

  const { data: { user } } = await (await userClient()).auth.getUser();
  if (!user) return fail("Connecting this phone… We'll try again in a moment.", 401);

  const admin = adminClient();
  const { data: photo } = await admin
    .from("result_photos")
    .select("id, unit_id, user_id, election, image_url, sha256_hash, polling_units(code)")
    .eq("id", body.data.photoId)
    .maybeSingle();
  if (!photo) return fail("We couldn't find this photo on the server. Please take it again.", 404);
  if (photo.user_id !== user.id) return fail("This photo was sent from a different phone, so it can't be read here.", 403);
  const election = parseElection(photo.election);

  // Idempotent: a retry after a dropped response just returns the existing reading.
  // "Read again" (same phone only) replaces it, e.g. after the reader misjudged the sheet.
  const { data: existing } = await admin.from("extracted_results").select("id").eq("photo_id", photo.id).maybeSingle();
  if (existing && body.data.reread) {
    const del = await admin.from("extracted_results").delete().eq("id", existing.id);
    if (del.error) return fail("Couldn't start a new reading. Please try again.", 500);
  } else if (existing) {
    const unit = await recomputeUnit(photo.unit_id, election);
    return NextResponse.json({ ok: true, photoId: photo.id, unitStatus: unit.status });
  }

  await admin.from("result_photos").update({ sync_status: "extracting" }).eq("id", photo.id);
  try {
    const file = await admin.storage.from("result-photos").download(photo.image_url);
    if (file.error) throw new Error(file.error.message);
    const bytes = await file.data.arrayBuffer();
    const hashVerified = (await sha256Hex(bytes)) === photo.sha256_hash;
    await admin.from("result_photos").update({ hash_verified: hashVerified }).eq("id", photo.id);
    // The file that arrived is not the photo the witness sealed (e.g. empty or cut short):
    // it can never count, so don't spend a reading on it. The phone asks for a retake.
    if (!hashVerified) {
      await admin.from("result_photos").update({ sync_status: "failed" }).eq("id", photo.id);
      return fail("This photo arrived damaged (its fingerprint doesn't match). Please take it again.", RETAKE_STATUS);
    }

    const fixture = demoFixture(photo.sha256_hash);
    const vision = fixture ?? (await extractFromImage(Buffer.from(bytes).toString("base64"), election));
    const { result, meta } = fromVision(vision);
    const flags = checkResult(result, meta);
    const unit = photo.polling_units as { code: string } | { code: string }[] | null;
    const chosenCode = (Array.isArray(unit) ? unit[0] : unit)?.code;
    const mismatch = chosenCode ? unitCodeFlag(vision, chosenCode) : null;
    if (mismatch) flags.push(mismatch);

    const ins = await admin.from("extracted_results").insert({
      photo_id: photo.id,
      ...result,
      check_flags: flags,
      ai_confidence: Math.round((meta.confidence ?? vision.confidence) * 100) / 100,
      model: fixture ? `${VISION_MODEL} (demo fixture)` : VISION_MODEL,
      raw: vision,
    });
    if (ins.error) throw new Error(ins.error.message);
    await admin.from("result_photos").update({ sync_status: "extracted" }).eq("id", photo.id);

    const status = await recomputeUnit(photo.unit_id, election);
    return NextResponse.json({ ok: true, photoId: photo.id, hashVerified, unitStatus: status.status });
  } catch (e) {
    await admin.from("result_photos").update({ sync_status: "failed" }).eq("id", photo.id);
    console.error("extract failed", e);
    if (e instanceof ExtractionError) return fail(e.message, e.retake ? RETAKE_STATUS : 502);
    // Couldn't reach Supabase or DeepSeek: the phone keeps the photo queued and tries again soon.
    if (isNetworkError(e)) return fail("Couldn't reach the reading service. Trying again shortly.", RETRYABLE_STATUS);
    return fail("Couldn't read this photo right now. It will retry.", 502);
  }
}

import { NextResponse } from "next/server";
import { apiT } from "@/lib/i18n/api";
import { z } from "zod";
import { Election } from "@/lib/elections";
import { isNetworkError } from "@/lib/network";
import { userClient } from "@/lib/supabase/server";
import { ExtractionError, extractFromImage } from "@/lib/vision/extract";
import { fromVision } from "@/lib/vision/map";

export const maxDuration = 60;

const Body = z.object({
  image: z.string().regex(/^data:image\/jpeg;base64,/).max(8_000_000),
  election: Election,
});

/**
 * Reads an official figure from a picture, so nobody has to type it: a screenshot or download
 * of the polling unit's sheet on INEC's result viewing portal (IReV), or a photo of the
 * collation sheet as announced. Returns the figures for the person to check before saving.
 * Nothing is stored here.
 */
export async function POST(req: Request) {
  const tr = apiT(req);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: tr("api.badPicture") }, { status: 400 });

  // Anonymous per-phone session (no login), so the reader can't be called by anyone off the app.
  const { data: { user } } = await (await userClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: tr("api.connecting") }, { status: 401 });

  try {
    const v = await extractFromImage(body.data.image.slice(body.data.image.indexOf(",") + 1), body.data.election);
    if (!v.is_result_sheet || !v.party_scores.length)
      return NextResponse.json({ error: tr("api.noPartyFigures") }, { status: 422 });
    const { result, meta } = fromVision(v);
    return NextResponse.json({
      partyScores: result.party_scores,
      unreadable: meta.unreadable,
      unitCode: v.unit.polling_unit_code,
      notes: v.notes,
    });
  } catch (e) {
    if (e instanceof ExtractionError) return NextResponse.json({ error: tr(e.key) }, { status: 422 });
    console.error("collation read failed", e);
    const msg = isNetworkError(e) ? tr("api.readerUnreachableTyped") : tr("api.pictureUnreadable");
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

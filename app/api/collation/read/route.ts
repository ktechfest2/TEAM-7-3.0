import { NextResponse } from "next/server";
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
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "That picture couldn't be used. Try a clear photo or screenshot (JPEG or PNG)." }, { status: 400 });

  // Anonymous per-phone session (no login), so the reader can't be called by anyone off the app.
  const { data: { user } } = await (await userClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecting this phone… Try again in a moment." }, { status: 401 });

  try {
    const v = await extractFromImage(body.data.image.slice(body.data.image.indexOf(",") + 1), body.data.election);
    if (!v.is_result_sheet || !v.party_scores.length)
      return NextResponse.json({ error: "We couldn't find party figures in this picture. Use a picture that shows each party's votes." }, { status: 422 });
    const { result, meta } = fromVision(v);
    return NextResponse.json({
      partyScores: result.party_scores,
      unreadable: meta.unreadable,
      unitCode: v.unit.polling_unit_code,
      notes: v.notes,
    });
  } catch (e) {
    if (e instanceof ExtractionError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("collation read failed", e);
    const msg = isNetworkError(e) ? "Couldn't reach the reading service. Check your connection and try again." : "We couldn't read this picture. Try again, or type the figures in.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

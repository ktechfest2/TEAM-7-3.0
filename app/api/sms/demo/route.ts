import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { INCIDENTS, formatIncidentLookupReply, helpReply, parseIncidentLookupMessage, parseIncidentMessage } from "@/lib/sms/incidents";
import { getRecentIncidentCounts } from "@/lib/sms/lookup";

export async function POST(request: Request) {
  let body: { from?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  const from = String(body.from ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!/^\+?[\d ()-]{7,24}$/.test(from) || !text || text.length > 500) {
    return NextResponse.json({ error: "Enter a phone number and a message up to 500 characters" }, { status: 400 });
  }

  const lookup = parseIncidentLookupMessage(text);
  if (lookup) {
    const db = adminClient();
    const { data: unit, error: unitError } = await db
      .from("polling_units")
      .select("id, code")
      .eq("code", lookup.unitCode)
      .eq("is_simulated", false)
      .eq("directory_is_current", true)
      .maybeSingle();
    if (unitError) {
      console.error("Demo incident lookup failed", unitError.message);
      return NextResponse.json({ error: "Polling unit lookup unavailable" }, { status: 503 });
    }
    if (!unit) {
      return NextResponse.json({ ok: true, accepted: false, reply: `Polling unit ${lookup.unitCode} was not found. Check the code and try again.` });
    }
    try {
      const counts = await getRecentIncidentCounts(unit.id);
      return NextResponse.json({ ok: true, accepted: true, lookup: true, reply: formatIncidentLookupReply(unit.code, counts, true) });
    } catch (error) {
      console.error("Demo incident count lookup failed", error);
      return NextResponse.json({ error: "Incident lookup unavailable" }, { status: 503 });
    }
  }

  const parsed = parseIncidentMessage(text);
  if (!parsed) return NextResponse.json({ ok: true, accepted: false, reply: helpReply() });

  const db = adminClient();
  const { data: unit, error: unitError } = await db
    .from("polling_units")
    .select("id, code")
    .eq("code", parsed.unitCode)
    .eq("is_simulated", false)
    .eq("directory_is_current", true)
    .maybeSingle();
  if (unitError) {
    console.error("Demo incident PU lookup failed", unitError.message);
    return NextResponse.json({ error: "Polling unit lookup unavailable" }, { status: 503 });
  }
  if (!unit) return NextResponse.json({ ok: true, accepted: false, reply: `Polling unit ${parsed.unitCode} was not found. Check the code and try again.` });

  const secret = process.env.SMS_SENDER_HASH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const senderFingerprint = secret ? createHmac("sha256", secret).update(from).digest("hex") : null;
  if (senderFingerprint) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await db.from("sms_incident_reports").select("id", { count: "exact", head: true })
      .eq("sender_fingerprint", senderFingerprint).eq("source", "demo").gte("received_at", since);
    if (error) return NextResponse.json({ error: "Rate limit check unavailable" }, { status: 503 });
    if ((count ?? 0) >= 10) return NextResponse.json({ error: "Demo limit reached for this sender. Try again later." }, { status: 429 });
  }

  const { data: report, error: insertError } = await db.from("sms_incident_reports").insert({
    unit_id: unit.id,
    incident_code: parsed.incidentCode,
    source: "demo",
    sender_fingerprint: senderFingerprint,
  }).select("id").single();
  if (insertError) {
    console.error("Demo incident insert failed", insertError.message);
    return NextResponse.json({ error: "Could not save incident report. Apply the sms_incident_reports migration first." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    accepted: true,
    reportId: report.id,
    reply: `SIMULATED reply: Your response has been recorded for ${unit.code}: ${INCIDENTS[parsed.incidentCode]}.`,
  });
}

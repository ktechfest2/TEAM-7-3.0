import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { INCIDENTS, formatIncidentLookupReply, helpReply, parseIncidentLookupMessage, parseIncidentMessage } from "@/lib/sms/incidents";
import { getRecentIncidentCounts } from "@/lib/sms/lookup";

type Incoming = { from?: string; text?: string; id?: string; linkId?: string; to?: string };

async function readIncoming(request: Request): Promise<Incoming> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return await request.json() as Incoming;
  const form = await request.formData();
  return {
    from: String(form.get("from") ?? ""),
    text: String(form.get("text") ?? ""),
    id: String(form.get("id") ?? "") || undefined,
    linkId: String(form.get("linkId") ?? "") || undefined,
    to: String(form.get("to") ?? "") || undefined,
  };
}

function senderFingerprint(sender: string) {
  const secret = process.env.SMS_SENDER_HASH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHmac("sha256", secret).update(sender.trim()).digest("hex") : null;
}

async function providerReply(to: string, message: string, linkId?: string) {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const shortcode = process.env.AFRICASTALKING_SHORTCODE;
  if (!apiKey || !shortcode) return false;

  const form = new URLSearchParams({
    username: "sandbox",
    to,
    from: shortcode,
    message,
  });
  if (linkId) form.set("linkId", linkId);
  const response = await fetch("https://api.sandbox.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  if (!response.ok) console.error("Africa's Talking sandbox reply failed", response.status, await response.text());
  return response.ok;
}

/** Africa's Talking OnDemand SMS callback. Configure the sandbox inbox callback to this URL. */
export async function POST(request: Request) {
  const callbackToken = process.env.AT_CALLBACK_TOKEN;
  if (!callbackToken || new URL(request.url).searchParams.get("token") !== callbackToken) {
    return NextResponse.json({ error: "Unauthorized callback" }, { status: 401 });
  }
  let incoming: Incoming;
  try {
    incoming = await readIncoming(request);
  } catch {
    return NextResponse.json({ error: "Expected an SMS callback payload" }, { status: 400 });
  }

  const from = String(incoming.from ?? "").trim();
  const text = String(incoming.text ?? "").trim();
  if (!from || from.length > 32 || !text || text.length > 500) {
    return NextResponse.json({ error: "Missing or invalid sender/message" }, { status: 400 });
  }

  const lookup = parseIncidentLookupMessage(text);
  const parsed = parseIncidentMessage(text);
  let reply: string;
  let reportId: string | null = null;
  let duplicate = false;

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
      console.error("SMS incident lookup failed", unitError.message);
      return NextResponse.json({ error: "Polling unit lookup unavailable" }, { status: 503 });
    }
    if (!unit) {
      reply = `Polling unit ${lookup.unitCode} was not found. Check the code on your voter's card and try again.`;
    } else {
      try {
        const counts = await getRecentIncidentCounts(unit.id);
        reply = formatIncidentLookupReply(unit.code, counts);
      } catch (error) {
        console.error("SMS incident count lookup failed", error);
        return NextResponse.json({ error: "Incident lookup unavailable" }, { status: 503 });
      }
    }
  } else if (!parsed) {
    reply = helpReply();
  } else {
    const db = adminClient();
    const { data: unit, error: unitError } = await db
      .from("polling_units")
      .select("id, code")
      .eq("code", parsed.unitCode)
      .eq("is_simulated", false)
      .eq("directory_is_current", true)
      .maybeSingle();

    if (unitError) {
      console.error("SMS incident PU lookup failed", unitError.message);
      return NextResponse.json({ error: "Polling unit lookup unavailable" }, { status: 503 });
    }
    if (!unit) {
      reply = `Polling unit ${parsed.unitCode} was not found. Check the code on your voter's card and try again.`;
    } else {
      const row = {
        unit_id: unit.id,
        incident_code: parsed.incidentCode,
        source: "at_sandbox" as const,
        provider_message_id: incoming.id || null,
        sender_fingerprint: senderFingerprint(from),
      };
      const { data: inserted, error: insertError } = await db
        .from("sms_incident_reports")
        .upsert(row, { onConflict: "provider_message_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("SMS incident insert failed", insertError.message);
        return NextResponse.json({ error: "Could not save incident report" }, { status: 503 });
      }
      reportId = inserted?.id ?? null;
      if (!reportId && incoming.id) {
        const { data: existing } = await db.from("sms_incident_reports").select("id").eq("provider_message_id", incoming.id).maybeSingle();
        reportId = existing?.id ?? null;
        duplicate = Boolean(existing);
      }
      if (!reportId) return NextResponse.json({ error: "Could not confirm saved incident" }, { status: 503 });
      reply = duplicate
        ? "Your response was already recorded."
        : `Your response has been recorded for ${unit.code}: ${INCIDENTS[parsed.incidentCode]}.`;
    }
  }

  let replySent = false;
  try {
    replySent = await providerReply(from, reply, incoming.linkId);
  } catch (error) {
    console.error("Africa's Talking sandbox reply error", error);
  }
  return NextResponse.json({ ok: true, reply, replySent, reportId, duplicate });
}

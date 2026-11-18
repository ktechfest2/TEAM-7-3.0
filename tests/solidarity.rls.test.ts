/**
 * Integration tests against a real Supabase project (the solidarity migration must be applied and
 * "Anonymous sign-ins" enabled). Skipped unless SOLIDARITY_RLS_TESTS=1. Run with:
 *   SOLIDARITY_RLS_TESTS=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/solidarity.rls.test.ts
 * (Node 22+). These create a few anonymous users and rows, labelled by note "rls-test".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const on = process.env.SOLIDARITY_RLS_TESTS === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function device() {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return { c, id: data.user!.id };
}

describe.skipIf(!on)("solidarity RLS", () => {
  let unitId: string;
  let a: { c: SupabaseClient; id: string };
  let b: { c: SupabaseClient; id: string };
  let reportId: string;
  let receipt: string;

  beforeAll(async () => {
    a = await device();
    b = await device();
    const { data } = await a.c.from("polling_units").select("id").limit(1).single();
    unitId = data!.id;
    const ins = await a.c.from("incident_reports").insert({ unit_id: unitId, category: "other", note: "rls-test" }).select("id").single();
    expect(ins.error).toBeNull();
    reportId = ins.data!.id;
    const r = await a.c.from("incident_reports").select("receipt_code").eq("id", reportId).single();
    receipt = r.data!.receipt_code;
  });

  it("a client cannot write status events", async () => {
    const { error } = await a.c.from("incident_status_events").insert({ report_id: reportId, status: "responded", responder_id: a.id });
    expect(error).not.toBeNull();
  });

  it("a client cannot read status events", async () => {
    const { data } = await a.c.from("incident_status_events").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("a client cannot set the receipt code", async () => {
    const { error } = await a.c.from("incident_reports").insert({ unit_id: unitId, category: "other", receipt_code: "AAAAAAAAAA" });
    expect(error).not.toBeNull();
  });

  it("another device cannot read my raw report", async () => {
    const { data } = await b.c.from("incident_reports").select("id").eq("id", reportId);
    expect(data ?? []).toHaveLength(0);
  });

  it("the public view shows the report without device id, note or media path", async () => {
    const { data } = await b.c.from("public_incidents").select("*").eq("id", reportId).single();
    expect(data).toBeTruthy();
    expect(Object.keys(data!)).not.toEqual(expect.arrayContaining(["device_id"]));
    expect(Object.keys(data!)).not.toEqual(expect.arrayContaining(["note"]));
    expect(Object.keys(data!)).not.toEqual(expect.arrayContaining(["media_path"]));
  });

  it("the anonymous receipt lookup works with the code", async () => {
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await anon.rpc("receipt_lookup", { code: receipt });
    expect(data).toHaveLength(1);
  });

  it("the reporter cannot confirm their own report", async () => {
    const { error } = await a.c.from("incident_confirmations").insert({ report_id: reportId, device_id: a.id });
    expect(error).not.toBeNull();
  });

  it("another device can confirm once, and a duplicate is rejected", async () => {
    const first = await b.c.from("incident_confirmations").insert({ report_id: reportId, device_id: b.id });
    expect(first.error).toBeNull();
    const second = await b.c.from("incident_confirmations").insert({ report_id: reportId, device_id: b.id });
    expect(second.error).not.toBeNull();
  });

  it("a device cannot confirm as someone else", async () => {
    const c = await device();
    const { error } = await c.c.from("incident_confirmations").insert({ report_id: reportId, device_id: b.id });
    expect(error).not.toBeNull();
  });

  it("a non-responder cannot read or sign private media", async () => {
    const down = await b.c.storage.from("incident-media").download(`${a.id}/x.jpg`);
    expect(down.error).not.toBeNull();
    const signed = await b.c.storage.from("incident-media").createSignedUrl(`${a.id}/x.jpg`, 60);
    expect(signed.data?.signedUrl).toBeUndefined();
  });

  it("need_help check-ins never reach the public safety view", async () => {
    const d = await device();
    await d.c.from("voter_checkins").insert({ unit_id: unitId, status: "need_help" });
    const { data } = await d.c.from("public_unit_safety").select("*");
    expect(JSON.stringify(data)).not.toContain("need_help");
  });

  it("the 6th report in an hour from one device is rejected", async () => {
    const d = await device();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await d.c.from("incident_reports").insert({ unit_id: unitId, category: "other", note: "rls-test" }));
    expect(results.slice(0, 5).every((r) => !r.error)).toBe(true);
    expect(results[5].error).not.toBeNull();
  });
});

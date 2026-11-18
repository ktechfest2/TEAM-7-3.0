import { describe, expect, it } from "vitest";
import { accountabilityStatus } from "@/lib/solidarity/accountability";
import { DEFAULT_SLA_MINUTES, MIN_PUBLIC_COUNT, RATE_LIMITS, slaMinutes } from "@/lib/solidarity/config";
import { canConfirm, countConfirmations, evidenceLevel } from "@/lib/solidarity/evidence";
import { rateLimit } from "@/lib/solidarity/ratelimit";
import { responderOrder, safetyTotals } from "@/lib/solidarity/safety";
import { parseSms } from "@/lib/solidarity/sms";
import type { CheckinStatus } from "@/lib/solidarity/types";

describe("evidence level", () => {
  it("defaults to reported", () => expect(evidenceLevel({ hasMedia: false, confirmations: 0 })).toBe("reported"));
  it("is backed_by_media when a fingerprint is present", () =>
    expect(evidenceLevel({ hasMedia: true, confirmations: 1 })).toBe("backed_by_media"));
  it("one confirmation is not enough", () => expect(evidenceLevel({ hasMedia: false, confirmations: 1 })).toBe("reported"));
  it("is confirmed with 2+ confirmations, with or without media", () => {
    expect(evidenceLevel({ hasMedia: false, confirmations: 2 })).toBe("confirmed");
    expect(evidenceLevel({ hasMedia: true, confirmations: 3 })).toBe("confirmed");
  });
});

describe("confirmations", () => {
  it("the reporter cannot confirm their own report", () => expect(canConfirm("a", "a", [])).toBe("own_report"));
  it("a duplicate confirmation from the same device is rejected", () => expect(canConfirm("a", "b", ["b"])).toBe("duplicate"));
  it("a new device may confirm", () => expect(canConfirm("a", "c", ["b"])).toBe("ok"));
  it("counts distinct devices and never the reporter", () => {
    expect(countConfirmations("a", ["a", "b", "b", "c"])).toBe(2);
  });
  it("reported → confirmed only after 2 OTHER devices confirm", () => {
    const level = (ids: string[]) => evidenceLevel({ hasMedia: false, confirmations: countConfirmations("a", ids) });
    expect(level(["a", "a"])).toBe("reported");
    expect(level(["b"])).toBe("reported");
    expect(level(["b", "c"])).toBe("confirmed");
  });
});

describe("accountability status", () => {
  const createdAt = "2026-11-19T10:00:00Z";
  const at = (min: number) => new Date(new Date(createdAt).getTime() + min * 60_000);
  const base = { createdAt, lastEvent: null, slaMinutes: 2 };

  it("is reported inside the SLA", () => expect(accountabilityStatus({ ...base, now: at(1) })).toBe("reported"));
  it("is still reported exactly at the SLA boundary", () => expect(accountabilityStatus({ ...base, now: at(2) })).toBe("reported"));
  it("is no_response just past the SLA", () =>
    expect(accountabilityStatus({ ...base, now: new Date(at(2).getTime() + 1) })).toBe("no_response"));
  it("a seen event wins over the clock", () =>
    expect(accountabilityStatus({ ...base, lastEvent: { status: "seen", at: at(1) }, now: at(500) })).toBe("seen"));
  it("a responded event wins", () =>
    expect(accountabilityStatus({ ...base, lastEvent: { status: "responded", at: at(3) }, now: at(500) })).toBe("responded"));
  it("changes with time alone (no job)", () => {
    expect(accountabilityStatus({ ...base, now: at(1) })).toBe("reported");
    expect(accountabilityStatus({ ...base, now: at(10) })).toBe("no_response");
  });
});

describe("SLA config", () => {
  it("defaults to 360 minutes", () => expect(slaMinutes(undefined)).toBe(DEFAULT_SLA_MINUTES));
  it("reads a custom value", () => expect(slaMinutes("2")).toBe(2));
  it("ignores bad values", () => {
    expect(slaMinutes("abc")).toBe(DEFAULT_SLA_MINUTES);
    expect(slaMinutes("0")).toBe(DEFAULT_SLA_MINUTES);
    expect(slaMinutes("")).toBe(DEFAULT_SLA_MINUTES);
  });
});

describe("safety totals", () => {
  const make = (...s: CheckinStatus[]) => s.map((status) => ({ status }));
  it("returns not_enough below the minimum, never a count", () => {
    const r = safetyTotals(make("voted", "voted", "voted", "home_safe"));
    expect(r).toEqual({ kind: "not_enough" });
  });
  it("returns totals at the minimum", () => {
    const r = safetyTotals(make("voted", "voted", "home_safe", "on_my_way", "voted"));
    expect(MIN_PUBLIC_COUNT).toBe(5);
    expect(r).toEqual({ kind: "ok", total: 5, on_my_way: 1, voted: 3, home_safe: 1 });
  });
  it("need_help is never public and never counted toward the minimum", () => {
    const four = make("voted", "voted", "voted", "voted", "need_help", "need_help");
    expect(safetyTotals(four)).toEqual({ kind: "not_enough" });
    const six = safetyTotals(make("voted", "voted", "voted", "voted", "home_safe", "need_help"));
    expect(six).toEqual({ kind: "ok", total: 5, on_my_way: 0, voted: 4, home_safe: 1 });
    expect(JSON.stringify(six)).not.toContain("need_help");
  });
  it("puts need_help first in the responder queue, then oldest first", () => {
    const q = responderOrder([
      { id: 1, needHelp: false, createdAt: "2026-11-19T08:00:00Z" },
      { id: 2, needHelp: true, createdAt: "2026-11-19T09:00:00Z" },
      { id: 3, needHelp: false, createdAt: "2026-11-19T07:00:00Z" },
    ]);
    expect(q.map((x) => x.id)).toEqual([2, 3, 1]);
  });
});

describe("rate limit", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it("allows up to 5 reports per hour", () => {
    expect(rateLimit([ago(1), ago(2), ago(3), ago(4)], "reports", now).allowed).toBe(true);
    const r = rateLimit([ago(1), ago(2), ago(3), ago(4), ago(5)], "reports", now);
    expect(r.allowed).toBe(false);
    expect(RATE_LIMITS.reports).toBe(5);
  });
  it("allows up to 20 check-ins per hour", () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => ago(i + 1));
    expect(rateLimit(nineteen, "checkins", now).allowed).toBe(true);
    expect(rateLimit([...nineteen, ago(30)], "checkins", now).allowed).toBe(false);
  });
  it("old submissions fall out of the window and say when to retry", () => {
    const old = [ago(70), ago(80), ago(90), ago(100), ago(110)];
    expect(rateLimit(old, "reports", now).allowed).toBe(true);
    const full = [ago(10), ago(20), ago(30), ago(40), ago(50)];
    expect(rateLimit(full, "reports", now).retryAt).toEqual(new Date(ago(50).getTime() + RATE_LIMITS.windowMs));
  });
});

describe("SMS parser", () => {
  const units = ["SIM-001", "SIM-002", "SIM-003"];
  it("parses valid messages, case-insensitively", () => {
    expect(parseSms("CT SIM-003 SAFE", units)).toEqual({ ok: true, unitCode: "SIM-003", status: "home_safe" });
    expect(parseSms("  ct sim-001  voted ", units)).toEqual({ ok: true, unitCode: "SIM-001", status: "voted" });
    expect(parseSms("CT SIM-002 HELP", units)).toEqual({ ok: true, unitCode: "SIM-002", status: "need_help" });
  });
  it("rejects bad format", () => {
    expect(parseSms("hello", units)).toEqual({ ok: false, reason: "format" });
    expect(parseSms("CT SIM-001", units)).toEqual({ ok: false, reason: "format" });
    expect(parseSms("XX SIM-001 SAFE", units)).toEqual({ ok: false, reason: "format" });
  });
  it("rejects an unknown status word", () => expect(parseSms("CT SIM-001 PARTYA", units)).toEqual({ ok: false, reason: "status" }));
  it("rejects a wrong unit code", () => expect(parseSms("CT SIM-999 SAFE", units)).toEqual({ ok: false, reason: "unit" }));
});

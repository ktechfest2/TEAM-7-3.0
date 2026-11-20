import { describe, expect, it } from "vitest";
import { checkResult } from "@/lib/rules/checks";
import { VisionExtraction } from "@/lib/schemas";
import { fromVision, toPartyCode, unitCodeFlag } from "@/lib/vision/map";
import { wordsToNumber } from "@/lib/vision/words";

const fig = (figures: number | null, words: string | null = null, confidence = 0.95) => ({ figures, words, confidence });

const sample = {
  is_result_sheet: true,
  form_type: "EC8A",
  legible: true,
  unit: { state: "Simulated", lga: null, ward: null, polling_unit_name: null, polling_unit_code: "SIM-003" },
  registered_voters: fig(690, "Six hundred and ninety"),
  accredited_voters: fig(403, "Four hundred and three"),
  party_scores: [
    { party: "PA", ...fig(131, "One hundred and thirty-one only") },
    { party: "PB", ...fig(142, "One Hundred & Forty Two") },
    { party: "P.C", ...fig(98, "Ninety eight") },
    { party: "PD", ...fig(26) },
  ],
  rejected_ballots: fig(6, "six"),
  total_valid_votes: fig(397),
  total_votes_cast: fig(403),
  confidence: 0.92,
  notes: "",
};

describe("VisionExtraction contract", () => {
  it("accepts the documented example", () => {
    expect(VisionExtraction.safeParse(sample).success).toBe(true);
  });

  it("rejects negative votes and missing keys", () => {
    expect(VisionExtraction.safeParse({ ...sample, total_votes_cast: fig(-1) }).success).toBe(false);
    const missing: Partial<typeof sample> = { ...sample };
    delete missing.legible;
    expect(VisionExtraction.safeParse(missing).success).toBe(false);
  });
});

describe("wordsToNumber", () => {
  it.each([
    ["One hundred and forty-two", 142],
    ["Nil", 0],
    ["one thousand two hundred and six only", 1206],
    ["Fourty", 40],
  ])("%s → %d", (words, n) => expect(wordsToNumber(words)).toBe(n));

  it("returns null for anything it can't read", () => {
    expect(wordsToNumber("one hundred and fourtee")).toBeNull();
    expect(wordsToNumber("131")).toBeNull();
    expect(wordsToNumber(null)).toBeNull();
  });
});

describe("toPartyCode", () => {
  it("normalises printed names to codes", () => {
    expect(toPartyCode("a.d.c")).toBe("ADC");
    expect(toPartyCode("All Progressives Congress")).toBeNull();
  });
});

describe("fromVision", () => {
  it("maps to the stored shape and passes rule checks", () => {
    const { result, meta } = fromVision(VisionExtraction.parse(sample));
    expect(result).toEqual({
      registered: 690, accredited: 403, rejected: 6, total_valid: 397, votes_cast: 403,
      party_scores: { PA: 131, PB: 142, PC: 98, PD: 26 },
    });
    expect(checkResult(result, meta)).toEqual([]);
  });

  it("turns null figures into blocking flags", () => {
    const v = VisionExtraction.parse({ ...sample, accredited_voters: fig(null, null, 0.1) });
    const { result, meta } = fromVision(v);
    expect(meta.unreadable).toEqual(["accredited"]);
    expect(checkResult(result, meta).filter((f) => f.severity === "blocking").length).toBeGreaterThan(0);
  });

  it("flags words/figures conflicts in code, keeping the figures", () => {
    const v = VisionExtraction.parse({
      ...sample,
      party_scores: [{ party: "PA", ...fig(171, "One hundred and thirty-one") }, ...sample.party_scores.slice(1)],
    });
    const { result, meta } = fromVision(v);
    expect(result.party_scores.PA).toBe(171);
    expect(meta.conflicts).toEqual(["PA"]);
  });

  it("never merges repeated party rows", () => {
    const v = VisionExtraction.parse({ ...sample, party_scores: [...sample.party_scores, { party: "PA", ...fig(5) }] });
    const { result, meta } = fromVision(v);
    expect(result.party_scores.PA).toBe(131);
    expect(meta.unreadable).toEqual(["PA"]);
  });

  it("uses the lowest field confidence", () => {
    const v = VisionExtraction.parse({ ...sample, rejected_ballots: fig(6, "six", 0.4) });
    expect(fromVision(v).meta.confidence).toBe(0.4);
  });

  it("blocks illegible sheets", () => {
    const { result, meta } = fromVision(VisionExtraction.parse({ ...sample, legible: false }));
    expect(checkResult(result, meta)).toEqual([{ code: "SHEET_ILLEGIBLE", severity: "blocking" }]);
  });
});

describe("unitCodeFlag", () => {
  const v = VisionExtraction.parse(sample); // sheet says SIM-003
  it("blocks a sheet whose code is a different unit", () => {
    expect(unitCodeFlag(v, "SIM-001")).toEqual({ code: "UNIT_CODE_MISMATCH", severity: "blocking", field: "SIM-003" });
  });
  it("is quiet when they match, even written differently", () => {
    expect(unitCodeFlag(v, "SIM-003")).toBeNull();
    const real = VisionExtraction.parse({ ...sample, unit: { ...sample.unit, polling_unit_code: "37-6-1-2" } });
    expect(unitCodeFlag(real, "37/06/01/002")).toBeNull();
  });
  it("blocks a result sheet with no readable code: the unit can't be confirmed", () => {
    expect(unitCodeFlag(VisionExtraction.parse({ ...sample, unit: { ...sample.unit, polling_unit_code: null } }), "SIM-001"))
      .toEqual({ code: "UNIT_CODE_UNREADABLE", severity: "blocking" });
  });
  it("is quiet for a photo that isn't a result sheet (that has its own flag)", () => {
    expect(unitCodeFlag(VisionExtraction.parse({ ...sample, is_result_sheet: false }), "SIM-001")).toBeNull();
  });
});

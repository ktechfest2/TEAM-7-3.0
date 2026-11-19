import { describe, expect, it } from "vitest";
import { flagMessage } from "@/lib/rules/messages";

describe("flagMessage", () => {
  it("speaks in plain language with the real numbers and names", () => {
    expect(flagMessage({ code: "PARTY_SUM_NE_TOTAL_VALID", severity: "warning", expected: 262, actual: 257 }))
      .toBe("The party scores add up to 257, but the sheet says total valid votes is 262.");
    expect(flagMessage({ code: "MISSING_FIELD", severity: "blocking", field: "accredited" })).toContain("Accredited voters");
    expect(flagMessage({ code: "WORDS_DIGITS_CONFLICT", severity: "warning", field: "PDP" })).toContain("PDP's score");
    expect(flagMessage({ code: "LOW_CONFIDENCE", severity: "warning", actual: 0.42 })).toContain("42%");
    expect(flagMessage({ code: "UNIT_CODE_MISMATCH", severity: "warning", field: "SIM-001" })).toContain("(SIM-001)");
  });
  it("never shows a raw placeholder", () => {
    for (const code of ["VOTES_CAST_GT_ACCREDITED", "ACCREDITED_GT_REGISTERED", "VALID_PLUS_REJECTED_NE_CAST", "NOT_A_RESULT_SHEET", "SHEET_ILLEGIBLE"] as const)
      expect(flagMessage({ code, severity: "warning", expected: 1, actual: 2 })).not.toMatch(/[{}]/);
  });
});

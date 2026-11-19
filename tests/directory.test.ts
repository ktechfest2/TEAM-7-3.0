import { describe, expect, it } from "vitest";
import { normalizePuCode } from "@/lib/directory";

describe("normalizePuCode", () => {
  it.each([
    ["24/05/03/012", "24/05/03/012"],
    ["24-5-3-12", "24/05/03/012"],
    [" 240503012 ", "24/05/03/012"],
    ["40503012", "04/05/03/012"],
    ["sim-003", "SIM-003"],
  ])("%s → %s", (input, code) => expect(normalizePuCode(input)).toBe(code));

  it("rejects anything that isn't a full code", () => {
    for (const bad of ["", "24/05/03", "24/05/03/0123", "123/05/03/012", "abc", "2405"]) expect(normalizePuCode(bad)).toBeNull();
  });
});

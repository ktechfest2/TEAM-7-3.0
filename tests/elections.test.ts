import { describe, expect, it } from "vitest";
import { ELECTIONS, electionLinks, parseElection } from "@/lib/elections";
import { CollationInput } from "@/lib/schemas";

describe("elections", () => {
  it("parses known elections and falls back to presidential", () => {
    expect(parseElection("governorship")).toBe("governorship");
    expect(parseElection("local_government")).toBe("local_government");
    expect(parseElection("mayor")).toBe("presidential");
    expect(parseElection(undefined)).toBe("presidential");
    expect(parseElection(["senatorial"])).toBe("presidential");
  });

  it("builds one link per tab", () => {
    const links = electionLinks((e) => `/units?election=${e}`);
    expect(Object.keys(links)).toEqual([...ELECTIONS]);
    expect(links.senatorial).toBe("/units?election=senatorial");
  });

  it("requires an election on collation input", () => {
    const base = {
      level: "ward", areaCode: "W1", unitId: "7b7a3b6e-9f3c-4b8e-9d2a-0c1f4e5a6b7c",
      partyScores: { PA: 1 }, source: "EC8B", announcedAt: "2026-11-19T10:00:00.000Z",
    };
    expect(CollationInput.safeParse(base).success).toBe(false);
    expect(CollationInput.safeParse({ ...base, election: "governorship" }).success).toBe(true);
  });
});

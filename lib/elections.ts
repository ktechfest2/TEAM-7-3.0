import { z } from "zod";

/** The elections a polling unit can post a result sheet for. Order = tab order. */
export const ELECTIONS = ["presidential", "governorship", "senatorial", "local_government"] as const;
export const Election = z.enum(ELECTIONS);
export type Election = z.infer<typeof Election>;
export const DEFAULT_ELECTION: Election = "presidential";

/** Reads an election from a query value, falling back to presidential. */
export const parseElection = (v: unknown): Election => {
  const parsed = Election.safeParse(v);
  return parsed.success ? parsed.data : DEFAULT_ELECTION;
};

/** Link targets for link-mode election tabs, e.g. electionLinks((e) => `/units?election=${e}`). */
export const electionLinks = (f: (e: Election) => string) =>
  Object.fromEntries(ELECTIONS.map((e) => [e, f(e)])) as Record<Election, string>;

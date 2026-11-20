import type { Election } from "./elections";
import type { IncidentCode } from "./sms/incidents";

/** One line in the home page's live feed. Everything here is already public (RLS: public read). */
export type FeedUnit = { code: string; name: string; ward: string; lga: string; state: string; is_simulated?: boolean };
export type FeedEvent =
  | { kind: "photo"; id: string; at: string; election: Election; unit: FeedUnit; photoId: string; image: string; hash: string; read: boolean }
  | { kind: "verified"; id: string; at: string; election: Election; unit: FeedUnit; witnesses: number }
  | { kind: "flagged"; id: string; at: string; election: Election; unit: FeedUnit; witnesses: number }
  | { kind: "mismatch"; id: string; at: string; election: Election; unit: FeedUnit; party: string; wall: number; announced: number }
  | { kind: "incident"; id: string; at: string; unit: FeedUnit; incidentCode: IncidentCode; reportCount: number; source: "demo" | "at_sandbox" | "mixed" };

export type FeedKind = FeedEvent["kind"];

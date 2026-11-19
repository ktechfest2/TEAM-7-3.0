import type { Election } from "./elections";

/** One line in the home page's live feed. Everything here is already public (RLS: public read). */
export type FeedUnit = { code: string; name: string; ward: string; lga: string; state: string };
export type FeedEvent =
  | { kind: "photo"; id: string; at: string; election: Election; unit: FeedUnit; photoId: string; image: string; hash: string; read: boolean }
  | { kind: "verified"; id: string; at: string; election: Election; unit: FeedUnit; witnesses: number }
  | { kind: "flagged"; id: string; at: string; election: Election; unit: FeedUnit; witnesses: number }
  | { kind: "mismatch"; id: string; at: string; election: Election; unit: FeedUnit; party: string; wall: number; announced: number };

export type FeedKind = FeedEvent["kind"];

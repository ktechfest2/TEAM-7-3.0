export const CHECKIN_STATUSES = ["on_my_way", "voted", "home_safe", "need_help"] as const;
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];

export const INCIDENT_CATEGORIES = [
  "vote_buying",
  "intimidation_or_violence",
  "ballot_problem",
  "officials_late_or_absent",
  "voter_blocked_or_wrong_unit",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export type EvidenceLevel = "reported" | "backed_by_media" | "confirmed";
export type AccountabilityStatus = "reported" | "seen" | "responded" | "no_response";

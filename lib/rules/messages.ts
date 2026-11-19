import { t, type MessageKey } from "../i18n";
import type { CheckFlag } from "../schemas";

const FIELD: Record<string, MessageKey> = {
  registered: "fig.registered",
  accredited: "fig.accredited",
  rejected: "fig.rejected",
  total_valid: "fig.total_valid",
  votes_cast: "fig.votes_cast",
  party_scores: "field.party_scores",
};

/** "Total valid votes", or "PDP's score" for a party code. */
function fieldLabel(field: string | undefined): string {
  if (!field) return t("field.sheet");
  const key = FIELD[field];
  return key ? t(key) : t("field.party", { party: field });
}

/** One plain-language sentence per check, with the actual numbers. */
export function flagMessage(f: CheckFlag): string {
  const vars = {
    label: fieldLabel(f.field),
    code: f.field ?? "",
    actual: f.actual ?? "?",
    expected: f.expected ?? "?",
    pct: f.actual !== undefined ? Math.round(f.actual * 100) : "?",
  };
  return t(`flag.${f.code}`, vars);
}

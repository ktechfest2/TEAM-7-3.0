/**
 * Compact polling-unit directory shapes shared by the API and the phone's offline cache.
 * Tree: state → LGA → ward names (≈9k wards, small enough to keep on every phone).
 * Area: every unit in one state, as tuples to keep the download small.
 */
export type DirectoryTree = Record<string, Record<string, string[]>>;
export type TreeResponse = { snapshot: string | null; tree: DirectoryTree };

/** [id, code, name, location, lga, ward] */
export type AreaUnitTuple = [string, string, string, string | null, string, string];
export type AreaResponse = { state: string; snapshot: string | null; units: AreaUnitTuple[] };

/** Supabase returns at most this many rows per request. */
export const PAGE_SIZE = 1000;

/**
 * Polling-unit code as printed on the PVC / sheet: "24/05/03/012", "24-5-3-12" or "240503012".
 * Returns the canonical "NN/NN/NN/NNN" form, the code unchanged for SIM-* demo units, or null.
 */
export function normalizePuCode(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/\s/g, "");
  if (/^SIM-\d{3}$/.test(raw)) return raw;
  const parts = /^\d{8,9}$/.test(raw)
    ? (() => { const p = raw.padStart(9, "0"); return [p.slice(0, 2), p.slice(2, 4), p.slice(4, 6), p.slice(6)]; })()
    : raw.split(/[/-]+/).filter(Boolean);
  if (parts.length !== 4 || parts.some((x) => !/^\d{1,3}$/.test(x))) return null;
  const [s, l, w, u] = parts;
  if (s.length > 2 || l.length > 2 || w.length > 2) return null;
  return `${s.padStart(2, "0")}/${l.padStart(2, "0")}/${w.padStart(2, "0")}/${u.padStart(3, "0")}`;
}

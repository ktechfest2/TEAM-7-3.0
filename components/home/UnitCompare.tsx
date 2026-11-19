"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, MapPin, Search, X } from "lucide-react";
import { DiffTable } from "@/components/DiffTable";
import { ElectionTabs } from "@/components/ElectionTabs";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import { DEFAULT_ELECTION, type Election } from "@/lib/elections";
import { formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { PartyDiff, UnitStatus } from "@/lib/schemas";

type Hit = { id: string; code: string; name: string; ward: string; lga: string; state: string; is_simulated: boolean };
type Comparison = {
  unit: Omit<Hit, "is_simulated">;
  status: UnitStatus;
  witnesses: number;
  announcedSource: { source: string; at: string } | null;
  diffs: PartyDiff[] | null;
};

/**
 * Search any polling unit and see its verified wall result next to the latest announced
 * figure for the chosen election. `children` (the drag example) shows until a unit is picked.
 */
export function UnitCompare({ children }: { children: React.ReactNode }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<Hit | null>(null);
  const [election, setElection] = useState<Election>(DEFAULT_ELECTION);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced type-ahead.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || unit?.code === term) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/units/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { units?: Hit[] };
        setHits(body.units ?? []);
        setOpen(true);
      } catch {
        /* aborted or offline: keep the last hits */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [q, unit]);

  // Load the comparison whenever the unit or election changes.
  useEffect(() => {
    if (!unit) return;
    let active = true;
    void fetch(`/api/compare?code=${encodeURIComponent(unit.code)}&election=${election}`)
      .then(async (res) => {
        const body = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(body.error ?? t("compare.failed"));
        setCmp(body as Comparison);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : t("compare.failed")));
    return () => { active = false; };
  }, [unit, election]);

  function pick(h: Hit) {
    setUnit(h);
    setCmp(null);
    setQ(h.code);
    setOpen(false);
  }

  function clear() {
    setUnit(null);
    setCmp(null);
    setError(null);
    setQ("");
    setHits([]);
  }

  const loading = !!unit && !cmp && !error;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-label={t("compare.search")}
          placeholder={t("compare.search")}
          value={q}
          onChange={(e) => { setQ(e.target.value); if (unit) setUnit(null); setCmp(null); }}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="field min-h-14 pr-12 pl-12 text-base"
        />
        {searching ? (
          <Loader2 aria-hidden className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-muted" />
        ) : q ? (
          <button onClick={clear} aria-label={t("compare.clear")} className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-2 text-muted">
            <X aria-hidden className="size-4" />
          </button>
        ) : null}

        {open && q.trim().length >= 2 && !unit && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-lift animate-pop-in">
            {hits.length === 0 && <li className="px-3 py-3 text-sm text-muted">{t("units.noMatch")}</li>}
            {hits.map((h) => (
              <li key={h.id} role="option" aria-selected={false}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.name}</span>
                    <span className="block truncate text-xs text-muted">{h.code} · {h.ward} · {h.lga}{h.state ? ` · ${h.state}` : ""}</span>
                  </span>
                  {h.is_simulated && <span className="rounded-md bg-sim-bg px-1.5 py-0.5 text-[10px] font-bold text-sim-text">{t("common.simulated")}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!unit ? (
        <>
          <p className="-mt-2 text-center text-xs font-semibold tracking-wide text-muted uppercase">{t("compare.orTry")}</p>
          {children}
        </>
      ) : (
        <section className="flex flex-col gap-4 animate-rise">
          <ElectionTabs value={election} onChange={(e) => { setElection(e); setCmp(null); }} />
          {error && <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{error}</p>}
          {loading && <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}
          {cmp && (
            <>
              <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted">{cmp.unit.code}</p>
                  <p className="font-semibold">{cmp.unit.name}</p>
                  <div className="mt-1.5"><WitnessMeter count={cmp.witnesses} status={cmp.status} /></div>
                </div>
                <StatusBadge status={cmp.status} size="sm" />
              </div>
              {cmp.diffs && cmp.announcedSource ? (
                <DiffTable
                  diffs={cmp.diffs}
                  source={cmp.announcedSource.source}
                  announcedAt={formatTime(cmp.announcedSource.at)}
                  wallAccredited={null}
                />
              ) : (
                <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">
                  {cmp.status !== "verified" ? (cmp.status === "flagged" ? t("unit.flaggedHint") : t("unit.pendingHint")) : t("unit.noCollation")}
                </p>
              )}
              <Link href={`/units/${encodeURIComponent(cmp.unit.code)}?election=${election}`} className="inline-flex items-center gap-1 self-center text-sm font-semibold text-brand">
                {t("review.viewUnit")} <ArrowRight aria-hidden className="size-4" />
              </Link>
            </>
          )}
        </section>
      )}
    </div>
  );
}

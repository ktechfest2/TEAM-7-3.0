"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Scale, Search, SearchX, Truck, X } from "lucide-react";
import { ElectionTabs } from "@/components/ElectionTabs";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import { electionLinks, type Election } from "@/lib/elections";
import { t, type MessageKey } from "@/lib/i18n";
import type { UnitStatus } from "@/lib/schemas";

export type UnitCardData = {
  id: string;
  code: string;
  name: string;
  ward: string;
  lga: string;
  moved: boolean;
  status: UnitStatus;
  witnesses: number;
  mismatches: number;
};

type Filter = "all" | UnitStatus | "mismatch";
const FILTERS: { key: Filter; label: MessageKey }[] = [
  { key: "all", label: "units.filter.all" },
  { key: "verified", label: "status.verified" },
  { key: "pending", label: "status.pending" },
  { key: "flagged", label: "status.flagged" },
  { key: "mismatch", label: "units.filter.mismatch" },
];
const isFilter = (v: string | null): v is Filter => FILTERS.some((f) => f.key === v);

/** Searchable, filterable list of polling units. */
export function UnitBrowser({ units, election }: { units: UnitCardData[]; election: Election }) {
  const initial = useSearchParams().get("status");
  const [filter, setFilter] = useState<Filter>(isFilter(initial) ? initial : "all");
  const [query, setQuery] = useState("");

  const count = (f: Filter) =>
    f === "all" ? units.length : f === "mismatch" ? units.filter((u) => u.mismatches > 0).length : units.filter((u) => u.status === f).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter((u) => {
      if (filter === "mismatch" ? u.mismatches === 0 : filter !== "all" && u.status !== filter) return false;
      return !q || [u.code, u.name, u.ward, u.lga].some((s) => s.toLowerCase().includes(q));
    });
  }, [units, filter, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
      <ElectionTabs value={election} links={electionLinks((e) => `/units?election=${e}${filter !== "all" ? `&status=${filter}` : ""}`)} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("units.search")}
          aria-label={t("units.search")}
          className="field pl-12"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-surface-2 text-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
                active ? "border-text bg-text text-bg" : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {t(f.label)}
              <span className={`font-mono text-xs tabular-nums ${active ? "opacity-70" : "opacity-60"}`}>{count(f.key)}</span>
            </button>
          );
        })}
      </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
          <SearchX aria-hidden className="size-8" />
          <p>{t("units.noMatch")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 stagger">
          {shown.map((u) => (
            <li key={u.id}>
              <Link href={`/units/${u.code}?election=${election}`} className="card pressable flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-muted">{u.code}</p>
                    <p className="mt-0.5 leading-snug font-semibold">{u.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{u.ward} · {u.lga}</p>
                  </div>
                  <StatusBadge status={u.status} size="sm" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {u.status === "flagged" ? (
                    <span className="text-xs text-review-text">{t("status.flagged.detail")}</span>
                  ) : (
                    <WitnessMeter count={u.witnesses} status={u.status} />
                  )}
                  <ChevronRight aria-hidden className="size-4 text-muted" />
                </div>
                {u.mismatches > 0 && (
                  <p className="flex items-center gap-2 rounded-xl bg-review-bg px-3 py-2 text-sm font-medium text-review-text">
                    <Scale aria-hidden className="size-4 shrink-0" /> {t("units.mismatch")}
                  </p>
                )}
                {u.moved && (
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Truck aria-hidden className="size-4" /> {t("units.moved")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Camera, Download, ExternalLink, FileText, ImageOff, Users, Scale } from "lucide-react";
import { DiffTable } from "@/components/DiffTable";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import type { Election } from "@/lib/elections";
import { ELECTION_STYLE } from "@/lib/election-style";
import { formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { IrevUnit, IrevUnitResponse } from "@/lib/irev/types";
import type { PartyDiff, UnitStatus } from "@/lib/schemas";
import { useFetch } from "./useIrev";

type Comparison = {
  unit: { code: string; name: string; ward: string; lga: string; state: string };
  status: UnitStatus;
  witnesses: number;
  announcedSource: { source: string; at: string } | null;
  diffs: PartyDiff[] | null;
  wall: Record<string, number | null> | null;
};

type Props = { electionId: string; puId: string; election: Election; unit: IrevUnit | null; onBack: () => void };

/** One polling unit: INEC's IReV upload on the left, CounTrack's witness record on the right. */
export function IrevCompare({ electionId, puId, election, unit: listed, onBack }: Props) {
  const pathname = usePathname();
  const lang = pathname.split("/").filter(Boolean)[0] || "en";
  // Opened from a shared link the ward list may not be loaded yet, so fetch the unit on its own.
  const single = useFetch<IrevUnitResponse>(listed ? null : `/api/irev?${new URLSearchParams({ level: "unit", electionId, pu: puId })}`);
  const unit = listed ?? single.body?.data ?? null;
  const code = unit?.code ?? null;
  const ours = useFetch<Comparison>(code ? `/api/compare?${new URLSearchParams({ code, election })}` : null);
  const style = ELECTION_STYLE[election];

  return (
    <div className="flex flex-col gap-4 animate-rise">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand">
        <ArrowLeft aria-hidden className="size-4" /> {t("irev.back")}
      </button>

      {!unit ? (
        single.error ? (
          <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{single.error}</p>
        ) : (
          <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />
        )
      ) : (
        <>
          <header className={`flex flex-col gap-3 rounded-3xl p-5 text-e-ink shadow-card sm:flex-row sm:items-center sm:justify-between md:p-6 ${style.bg}`}>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-xs font-bold opacity-70">
                <style.icon aria-hidden className="size-3.5" /> {t(`election.${election}`)} · {unit.irevCode ?? "—"}
              </p>
              <h2 className="display mt-1 text-3xl text-balance md:text-4xl">{unit.name}</h2>
              <p className="mt-2 text-sm font-medium opacity-75">
                {unit.uploadedAt ? t("irev.uploadedAt", { at: formatTime(unit.uploadedAt) }) : t("irev.notUploaded")}
                {unit.isSupplement && <span className="ml-2 rounded-md bg-e-ink px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">{t("irev.supplement")}</span>}
              </p>
            </div>
            {unit.documentUrl && (
              <div className="flex shrink-0 gap-2">
                {code && <Link
                  href={`/${lang}/collation?${new URLSearchParams({ election, unitCode: code, irevElectionId: electionId, irevPuId: unit.id })}`}
                  className="btn min-h-10 bg-brand px-3.5 text-sm text-brand-ink hover:opacity-90"
                >
                  <Scale aria-hidden className="size-4" /> {t("irev.compareInCounTrack")}
                </Link>}
                <a
                  href={`/api/irev/sheet?${new URLSearchParams({ electionId, pu: unit.id, download: "1" })}`}
                  className="btn min-h-10 bg-e-ink px-3.5 text-sm text-white hover:opacity-90"
                >
                  <Download aria-hidden className="size-4" /> {t("irev.download")}
                </a>
                <a href={unit.documentUrl} target="_blank" rel="noreferrer noopener" className="btn min-h-10 border-2 border-e-ink/80 px-3.5 text-sm hover:bg-e-ink/10">
                  <ExternalLink aria-hidden className="size-4" /> {t("irev.openOriginal")}
                </a>
              </div>
            )}
          </header>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* IReV */}
            <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
              <h3><span className="inline-flex items-center gap-2 rounded-full bg-text px-3 py-1 text-xs font-bold tracking-wide text-bg uppercase">INEC · IReV</span></h3>
              <Sheet unit={unit} />
            </section>

            {/* CounTrack */}
            <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
              <h3><span className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-bold tracking-wide text-brand-ink uppercase">{t("irev.side.ours")}</span></h3>
              {!code ? (
                <Note>{t("irev.ours.noCode")}</Note>
              ) : ours.loading ? (
                <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
              ) : ours.error || !ours.body ? (
                <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><Users aria-hidden className="size-4" /> {t("irev.ours.none")}</p>
                  <p className="text-muted">{t("irev.ours.noneBody")}</p>
                  <Link href="/capture" className="btn btn-primary min-h-10 px-4 text-sm">
                    <Camera aria-hidden className="size-4" /> {t("irev.ours.capture")}
                  </Link>
                </div>
              ) : (
                <Ours cmp={ours.body} election={election} />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">{children}</p>;
}

function Sheet({ unit }: { unit: IrevUnit }) {
  const [broken, setBroken] = useState(false);
  if (!unit.documentUrl) {
    return (
      <div className="grid min-h-72 place-items-center rounded-2xl bg-surface-2 p-6 text-center text-sm text-muted">
        <div className="flex flex-col items-center gap-2">
          <ImageOff aria-hidden className="size-8" />
          <p className="font-semibold text-text">{t("irev.sheet.none")}</p>
          <p>{t("irev.sheet.noneBody")}</p>
        </div>
      </div>
    );
  }
  if (unit.isPdf || broken) {
    return (
      <a href={unit.documentUrl} target="_blank" rel="noreferrer noopener" className="grid min-h-72 place-items-center rounded-2xl bg-surface-2 p-6 text-center text-sm">
        <span className="flex flex-col items-center gap-2">
          <FileText aria-hidden className="size-8 text-brand" />
          <span className="font-semibold">{unit.isPdf ? t("irev.sheet.pdf") : t("irev.sheet.broken")}</span>
          <span className="inline-flex items-center gap-1 text-brand">{t("irev.openOriginal")} <ArrowUpRight aria-hidden className="size-4" /></span>
        </span>
      </a>
    );
  }
  return (
    <a href={unit.documentUrl} target="_blank" rel="noreferrer noopener" className="group relative block overflow-hidden rounded-2xl bg-surface-2">
      {/* External INEC storage, any size: a plain img keeps it simple and avoids proxying every view. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={unit.documentUrl}
        alt={t("irev.sheet.alt", { name: unit.name })}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="max-h-[42rem] w-full object-contain transition group-hover:scale-[1.01]"
      />
      <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">{t("irev.sheet.zoom")}</span>
    </a>
  );
}

function Ours({ cmp, election }: { cmp: Comparison; election: Election }) {
  const parties = cmp.wall ? Object.entries(cmp.wall).sort(([a], [b]) => a.localeCompare(b)) : [];
  const max = Math.max(1, ...parties.map(([, v]) => v ?? 0));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface-2/60 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">{cmp.unit.code}</p>
          <p className="truncate font-semibold">{cmp.unit.name}</p>
          <div className="mt-1.5"><WitnessMeter count={cmp.witnesses} status={cmp.status} /></div>
        </div>
        <StatusBadge status={cmp.status} size="sm" />
      </div>

      {parties.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t("irev.ours.wall")}</p>
          <ul className="flex flex-col gap-2">
            {parties.map(([party, votes]) => (
              <li key={party} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3">
                <span className="font-semibold">{party}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${((votes ?? 0) / max) * 100}%` }} />
                </span>
                <span className="min-w-12 text-right font-mono text-lg font-bold tabular-nums">{votes ?? "—"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{t("irev.ours.checkHint")}</p>
        </div>
      ) : (
        <Note>{cmp.status === "flagged" ? t("unit.flaggedHint") : t("unit.pendingHint")}</Note>
      )}

      {cmp.diffs && cmp.announcedSource && (
        <DiffTable diffs={cmp.diffs} source={cmp.announcedSource.source} announcedAt={formatTime(cmp.announcedSource.at)} wallAccredited={null} />
      )}

      <Link href={`/units/${encodeURIComponent(cmp.unit.code)}?election=${election}`} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-brand">
        {t("review.viewUnit")} <ArrowUpRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

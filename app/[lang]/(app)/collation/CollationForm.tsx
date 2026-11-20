"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Building2, Check, Clock, FileText, Globe, ImageUp, Loader2, MapPin, Megaphone, Plus, Scale, Send, TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { UnitPickerFields, useUnitPicker } from "@/components/capture/UnitPicker";
import { DoodlePattern } from "@/components/home/Sticker";
import { HeroPanel, HeroTray } from "@/components/HeroPanel";
import { normalizePuCode } from "@/lib/directory";
import { ELECTION_STYLE } from "@/lib/election-style";
import { DEFAULT_ELECTION, ELECTIONS, parseElection, type Election } from "@/lib/elections";
import { signed } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";
import { errorMessage, fetchJson, UserError } from "@/lib/http";
import { fileToJpeg } from "@/lib/image";
import { useOnline } from "@/lib/offline/hooks";
import { REGISTERED_PARTIES } from "@/lib/parties";
import { diffScores } from "@/lib/rules/diff";
import type { UnitStatus } from "@/lib/schemas";
import { ensureSession } from "@/lib/supabase/browser";

/** Where the official figure came from. Shown next to every comparison. */
const SOURCES: { value: string; label: MessageKey; icon: LucideIcon }[] = [
  { value: "INEC IReV", label: "collation.source.irev", icon: Globe },
  { value: "Collation centre announcement", label: "collation.source.announcement", icon: Megaphone },
  { value: "EC8B collation sheet", label: "collation.source.ec8b", icon: FileText },
  { value: "Other", label: "collation.source.other", icon: Building2 },
];

/** Party avatars cycle through the election palette so each row is easy to track by eye. */
const AVATAR = ["bg-e-pres", "bg-e-gov", "bg-e-sen", "bg-e-reps", "bg-e-assembly", "bg-e-chair", "bg-e-council"];
const avatarFor = (party: string) => AVATAR[[...party].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR.length];

const number = new Intl.NumberFormat("en-NG");
const fmt = (n: number) => number.format(n);

type Wall = { status: UnitStatus; scores: Record<string, number> | null };
type Verdict = "checking" | "unavailable" | "waiting" | "enter" | "match" | "differ";

/**
 * The tally board: pick a polling unit, enter the official (announced / IReV) figure, typed or
 * read from a picture, and see it beside what witnesses verified on the wall, party by party.
 */
export function CollationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialCode = params.get("unitCode");
  const irevElectionId = params.get("irevElectionId");
  const irevPuId = params.get("irevPuId");
  const irevMode = !!(irevElectionId && irevPuId);
  const online = useOnline();
  const picker = useUnitPicker(online, initialCode);
  const { unitId, unitCode, unitName } = picker.selection;
  const [election, setElection] = useState<Election>(() => parseElection(params.get("election") ?? DEFAULT_ELECTION));
  const [wall, setWall] = useState<{ key: string; value: Wall | "failed" } | null>(null);
  const [wallAttempt, setWallAttempt] = useState(0);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [newParty, setNewParty] = useState("");
  const [source, setSource] = useState(SOURCES[0].value);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const irevImportStarted = useRef(false);

  // The verified wall result for this unit and election, shown beside each figure.
  const wallKey = unitCode ? `${unitCode}/${election}` : "";
  useEffect(() => {
    if (!wallKey || !unitCode) return;
    let active = true;
    fetchJson<{ status: UnitStatus; wall: Record<string, number> | null }>(`/api/compare?code=${encodeURIComponent(unitCode)}&election=${election}`, undefined, "collation.wallFailed")
      .then((b) => active && setWall({ key: wallKey, value: { status: b.status ?? "pending", scores: b.wall ?? null } }))
      // Don't pretend the unit has no wall result: say the check failed and offer a retry.
      .catch(() => active && setWall({ key: wallKey, value: "failed" }));
    return () => { active = false; };
  }, [wallKey, unitCode, election, wallAttempt]);
  const wallFailed = wall?.key === wallKey && wall.value === "failed";
  const current = wall?.key === wallKey && wall.value !== "failed" ? wall.value : null;
  const wallScores = current?.scores ?? null;

  const base = wallScores ? Object.keys(wallScores).sort() : [...REGISTERED_PARTIES];
  const parties = [...new Set([...base, ...extra])];
  const newCode = newParty.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  // Blank parties are unknown for this analysis. Never turn an omitted party into a zero.
  const entered = Object.fromEntries(parties.filter((p) => scores[p]).map((p) => [p, Number(scores[p])]));
  const anyEntered = Object.keys(entered).length > 0;
  const comparable = wallScores && anyEntered
    ? Object.fromEntries(Object.entries(entered).filter(([p]) => Object.hasOwn(wallScores, p)))
    : {};
  const comparableWall = wallScores
    ? Object.fromEntries(Object.keys(comparable).map((p) => [p, wallScores[p]]))
    : {};
  const diffs = wallScores && Object.keys(comparable).length ? diffScores(comparableWall, comparable) : null;
  const diffBy = new Map(diffs?.map((d) => [d.party, d]));
  const differing = diffs?.filter((d) => d.difference !== 0) ?? [];
  const gap = differing.reduce((s, d) => s + Math.abs(d.difference), 0);
  const announcedTotal = Object.values(comparable).reduce((s, n) => s + n, 0);
  const wallTotal = wallScores && Object.keys(comparable).length
    ? Object.keys(comparable).reduce((s, p) => s + (wallScores[p] ?? 0), 0)
    : null;

  const verdict: Verdict = wallFailed ? "unavailable" : !current ? "checking" : !wallScores ? "waiting" : !Object.keys(comparable).length ? "enter" : differing.length ? "differ" : "match";
  const style = ELECTION_STYLE[election];

  /** Reads the figures from a screenshot / photo of the official result and fills the boxes. */
  async function readPicture(file: File, requireUnitMatch = false) {
    setReading(true);
    setError(null);
    setReadNote(null);
    try {
      if (!(await ensureSession())) throw new UserError(t("collation.failed"));
      const photo = await fileToJpeg(file);
      const res = await fetch("/api/collation/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: photo.dataUrl, election }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; partyScores?: Record<string, number>; unitCode?: string | null; notes?: string };
      if (!res.ok || !body.partyScores) throw new UserError(body.error ?? t("collation.readFailed"));
      const read = body.partyScores;
      const onPicture = body.unitCode ? normalizePuCode(body.unitCode) : null;
      const chosen = unitCode ? normalizePuCode(unitCode) ?? unitCode : null;
      if (requireUnitMatch && (!onPicture || !chosen || onPicture !== chosen)) {
        setScores({});
        setExtra([]);
        throw new Error(onPicture ? t("collation.readOtherUnit", { code: onPicture }) : t("collation.irevUnitUnreadable"));
      }
      setExtra((x) => [...new Set([...x, ...Object.keys(read).filter((p) => !base.includes(p))])]);
      setScores(Object.fromEntries(Object.entries(read).map(([p, v]) => [p, String(v)])));
      setReadNote(
        onPicture && chosen && onPicture !== chosen
          ? t("collation.readOtherUnit", { code: onPicture })
          : t("collation.readDone", { n: Object.keys(read).length }),
      );
    } catch (e) {
      setError(errorMessage(e, "collation.readFailed"));
    } finally {
      setReading(false);
    }
  }

  // Import the selected INEC IReV document through our same-origin proxy and read it with
  // the existing vision endpoint. This remains an on-screen analysis and is never saved as
  // an official/announced record.
  useEffect(() => {
    if (!irevMode || irevImportStarted.current || !unitCode) return;
    irevImportStarted.current = true;
    setSource("INEC IReV");
    setReadNote(t("collation.irevLoading"));
    void (async () => {
      try {
        const query = new URLSearchParams({ electionId: irevElectionId!, pu: irevPuId! });
        const response = await fetch(`/api/irev/sheet?${query}`);
        if (!response.ok) throw new Error(t("collation.readFailed"));
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error(t("collation.irevPdf"));
        const file = new File([blob], "irev-result", { type: blob.type });
        await readPicture(file, true);
      } catch (e) {
        setReadNote(null);
        setError(e instanceof Error ? e.message : t("collation.readFailed"));
      }
    })();
  // Query parameters are immutable for this page visit; the ref prevents duplicate imports.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irevMode, unitCode]);

  function reset() {
    setScores({});
    setExtra([]);
    setReadNote(null);
    setError(null);
  }

  function addParty() {
    if (newCode && !parties.includes(newCode)) setExtra((x) => [...x, newCode]);
    setNewParty("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (irevMode) return setError(t("collation.irevAnalysisOnly"));
    if (!unitId) return;
    setError(null);
    if (!anyEntered) return setError(t("collation.empty"));
    if (wallScores && Object.keys(wallScores).some((p) => !Object.hasOwn(entered, p))) {
      return setError(t("collation.completeForSaving"));
    }
    setBusy(true);
    if (!(await ensureSession())) {
      setBusy(false);
      return setError(t("collation.failed"));
    }
    const res = await fetch("/api/collation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "ward",
        election,
        areaCode: unitCode ?? unitId, // the server replaces this with the unit's ward for ward-level lines
        unitId,
        partyScores: entered,
        source,
        announcedAt: new Date().toISOString(),
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; unitCode?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? t("collation.failed"));
    router.push(`/units/${encodeURIComponent(body?.unitCode ?? unitCode ?? "")}?election=${election}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* ── Hero: the promise, the election, the unit ─────────────────────── */}
      <HeroPanel
        id="collate-doodles"
        eyebrow={t("collation.hero.eyebrow")}
        eyebrowIcon={Scale}
        title={t("collation.hero.title")}
        highlight={t("collation.hero.title2")}
        highlightClass={style.text}
        subtitle={t("collation.hero.sub")}
        aside={
          <ol className="hidden flex-col gap-2 text-sm md:flex lg:w-72">
            {(["collation.step.pick", "collation.step.enter", "collation.step.compare"] as const).map((k, i) => (
              <li key={k} className="flex items-center gap-3 rounded-2xl bg-frame-ink/[0.07] px-3 py-2.5">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold text-e-ink ${style.bg}`}>{i + 1}</span>
                {t(k)}
              </li>
            ))}
          </ol>
        }
      >
        <div role="tablist" aria-label={t("election.label")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 lg:pb-0">
          {ELECTIONS.map((e) => {
            const s = ELECTION_STYLE[e];
            const active = e === election;
            return (
              <button
                key={e}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setElection(e); reset(); }}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold whitespace-nowrap transition active:scale-[0.97] lg:min-w-0 lg:pr-3 ${
                  active ? `${s.bg} text-e-ink shadow-lift` : "bg-frame-ink/[0.07] text-frame-ink hover:bg-frame-ink/[0.13]"
                }`}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${active ? "bg-e-ink/10" : `${s.bg} text-e-ink`}`}>
                  <s.icon aria-hidden className="size-4" strokeWidth={2.2} />
                </span>
                {t(`election.${e}`)}
              </button>
            );
          })}
        </div>

        <HeroTray>
          <UnitPickerFields picker={picker} showArea={false} gridClassName="grid grid-cols-2 gap-3 lg:grid-cols-4" />
        </HeroTray>
      </HeroPanel>

      {/* ── Board ─────────────────────────────────────────────────────────── */}
      {!unitId ? (
        <EmptyBoard />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="card flex min-w-0 flex-col overflow-hidden animate-rise" aria-label={t("collation.board")}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 md:p-5">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="eyebrow">{t("collation.board")}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {unitCode && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-medium text-muted">{unitCode}</span>}
                  <span className="truncate font-semibold">{unitName}</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <MapPin aria-hidden className="size-3.5" /> {[picker.ward, picker.lga, picker.state].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {irevMode && <a
                  href={`/api/irev/sheet?${new URLSearchParams({ electionId: irevElectionId!, pu: irevPuId!, download: "1" })}`}
                  className="btn btn-secondary min-h-11 px-4 text-sm"
                >{t("irev.download")}</a>}
                <label className={`btn btn-gold min-h-11 cursor-pointer px-4 text-sm ${reading ? "pointer-events-none opacity-60" : ""}`}>
                  {reading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImageUp aria-hidden className="size-4" />}
                  {reading ? t("collation.reading") : t("collation.fromPicture")}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={reading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void readPicture(file, irevMode);
                    }}
                  />
                </label>
              </div>
            </header>

            {readNote && (
              <p role="status" className="mx-4 mt-4 flex gap-2 rounded-xl bg-sim-bg px-3 py-2.5 text-sm text-sim-text md:mx-5">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {readNote}
              </p>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,7.5rem)_4.5rem] items-center gap-x-3 px-4 pt-4 pb-2 text-[11px] font-semibold tracking-wider text-muted uppercase md:grid-cols-[minmax(0,1fr)_6rem_10rem_6rem] md:px-5">
              <span>{t("collation.col.party")}</span>
              <span className="text-right">{t("collation.col.wall")}</span>
              <span className="text-center">{t("collation.col.announced")}</span>
              <span className="text-right">{t("collation.col.gap")}</span>
            </div>

            <ul className="flex flex-col px-2 md:px-3">
              {parties.map((p) => {
                const wallVotes = wallScores?.[p];
                const typed = scores[p] ?? "";
                const d = diffBy.get(p);
                const off = !!d && d.difference !== 0;
                return (
                  <li
                    key={p}
                    className={`grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,7.5rem)_4.5rem] items-center gap-x-3 rounded-2xl px-2 py-2 transition-colors md:grid-cols-[minmax(0,1fr)_6rem_10rem_6rem] ${
                      off ? "bg-review-bg/60" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-xl font-mono text-[11px] font-bold text-e-ink ${avatarFor(p)}`}>
                        {p.slice(0, 3)}
                      </span>
                      <span className="truncate font-semibold">{p}</span>
                    </span>
                    <span className="text-right font-mono text-sm text-muted tabular-nums">{wallVotes === undefined ? "—" : fmt(wallVotes)}</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="—"
                      aria-label={`${p} ${t("collation.col.announced")}`}
                      value={typed}
                      onChange={(e) => setScores((s) => ({ ...s, [p]: e.target.value.replace(/\D/g, "") }))}
                      className={`field min-h-11 text-center font-mono text-lg font-semibold tabular-nums ${off ? "border-review-text" : ""}`}
                    />
                    <GapBadge diff={d?.difference} blank={!typed && !!d} />
                  </li>
                );
              })}
            </ul>

            <div className="mx-4 mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,7.5rem)_4.5rem] items-center gap-x-3 border-t border-dashed border-border px-2 py-3 md:mx-5 md:grid-cols-[minmax(0,1fr)_6rem_10rem_6rem]">
              <span className="text-sm font-bold">{t("collation.total")}</span>
              <span className="text-right font-mono text-sm font-semibold tabular-nums">{wallTotal === null ? "—" : fmt(wallTotal)}</span>
              <span className="text-center font-mono text-lg font-bold tabular-nums">{Object.keys(comparable).length ? fmt(announcedTotal) : "—"}</span>
              <GapBadge diff={wallTotal !== null && anyEntered ? announcedTotal - wallTotal : undefined} />
            </div>

            <footer className="flex flex-col gap-2 border-t border-border bg-surface-2/40 p-4 md:p-5">
              <div className="flex gap-2">
                <input
                  value={newParty}
                  onChange={(e) => setNewParty(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParty(); } }}
                  placeholder={t("collation.addParty")}
                  aria-label={t("collation.addParty")}
                  className="field min-h-11 flex-1 bg-surface uppercase placeholder:normal-case"
                />
                <button type="button" onClick={addParty} disabled={!newCode} className="btn btn-secondary min-h-11 px-4">
                  <Plus aria-hidden className="size-4" /> {t("collation.add")}
                </button>
              </div>
              <p className="text-xs text-muted">{t("collation.partiesHint")}</p>
            </footer>
          </section>

          {/* ── Verdict, source and save: stays in view while you type ───────── */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <VerdictCard verdict={verdict} differing={differing.length} gap={gap} onRetry={() => { setWall(null); setWallAttempt((n) => n + 1); }} />

            <fieldset className="card flex flex-col gap-2 p-4">
              <legend className="contents">
                <span className="mb-1 text-sm font-semibold">{t("collation.source")}</span>
              </legend>
              {SOURCES.map((s) => {
                const active = s.value === source;
                return (
                  <label
                    key={s.value}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-sm font-medium transition ${
                      active ? "border-text bg-surface shadow-card" : "border-border hover:bg-surface-2/60"
                    }`}
                  >
                    <input type="radio" name="source" value={s.value} checked={active} onChange={() => setSource(s.value)} className="sr-only" />
                    <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${active ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
                      <s.icon aria-hidden className="size-4" />
                    </span>
                    <span className="flex-1">{t(s.label)}</span>
                    {active && <Check aria-hidden className="size-4 text-brand" />}
                  </label>
                );
              })}
            </fieldset>

            {error && <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{error}</p>}

            {irevMode && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{t("collation.irevAnalysisOnly")}</p>}
            <button disabled={busy || reading || irevMode} className="btn btn-primary min-h-14 text-base">
              {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5" />}
              {busy ? t("common.saving") : t("collation.submit")}
            </button>
          </aside>
        </div>
      )}
    </form>
  );
}

/** "=" when a party agrees, the signed gap when it doesn't, "—" when there is nothing to compare. */
function GapBadge({ diff, blank }: { diff: number | undefined; blank?: boolean }) {
  if (diff === undefined) return <span className="text-right font-mono text-sm text-muted">—</span>;
  if (diff === 0)
    return (
      <span className="flex justify-end">
        <span className="inline-flex items-center gap-1 rounded-full bg-ok-bg px-2 py-1 text-xs font-bold text-ok-text">
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
        </span>
      </span>
    );
  return (
    <span className="flex justify-end" title={blank ? t("collation.blankZero") : undefined}>
      <span className={`rounded-full px-2 py-1 font-mono text-xs font-bold tabular-nums ${blank ? "border border-dashed border-review-text/50 text-review-text" : "bg-accent text-e-ink"}`}>
        {signed(diff)}
      </span>
    </span>
  );
}

function VerdictCard({ verdict, differing, gap, onRetry }: { verdict: Verdict; differing: number; gap: number; onRetry: () => void }) {
  const look: Record<Verdict, { icon: LucideIcon; tone: string; title: string; body?: string }> = {
    checking: { icon: Loader2, tone: "bg-frame-ink/10 text-frame-ink", title: t("collation.verdict.checking") },
    unavailable: { icon: TriangleAlert, tone: "bg-accent text-e-ink", title: t("collation.verdict.failed"), body: t("collation.wallFailed") },
    waiting: { icon: Clock, tone: "bg-frame-ink/10 text-frame-ink", title: t("collation.verdict.waiting"), body: t("collation.noWallYet") },
    enter: { icon: ArrowRight, tone: "bg-frame-ink/10 text-frame-ink", title: t("collation.verdict.enter"), body: t("collation.verdict.enterBody") },
    match: { icon: Check, tone: "bg-pop text-e-ink", title: t("collation.verdict.match"), body: t("collation.verdict.matchBody") },
    differ: {
      icon: TriangleAlert,
      tone: "bg-accent text-e-ink",
      title: differing === 1 ? t("collation.verdict.differOne") : t("collation.verdict.differ", { n: differing }),
      body: t("collation.verdict.differBody", { n: fmt(gap) }),
    },
  };
  const v = look[verdict];
  return (
    <section aria-live="polite" className="relative overflow-hidden rounded-[1.75rem] bg-frame-2 p-5 text-frame-ink shadow-lift">
      <DoodlePattern id="verdict-doodles" scale={0.6} className="text-frame-ink opacity-[0.05]" />
      <div className="relative flex flex-col gap-3">
        <span className="eyebrow text-frame-muted">{t("collation.verdict")}</span>
        <div className="flex items-center gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${v.tone}`}>
            <v.icon aria-hidden className={`size-6 ${verdict === "checking" ? "animate-spin" : ""}`} strokeWidth={2.4} />
          </span>
          <p className="display text-2xl leading-tight">{v.title}</p>
        </div>
        {v.body && <p className="text-sm text-frame-muted">{v.body}</p>}
        {verdict === "unavailable" && (
          <button type="button" onClick={onRetry} className="btn btn-outline-light min-h-10 self-start text-sm">{t("error.retry")}</button>
        )}
      </div>
    </section>
  );
}

/** Before a unit is chosen: what the board will do, drawn as two sheets facing off. */
function EmptyBoard() {
  const sheet = (label: string, tone: string) => (
    <div className="flex w-28 flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card md:w-36">
      <span className={`w-fit rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-e-ink uppercase ${tone}`}>{label}</span>
      {[80, 60, 72, 44].map((w, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="h-1.5 rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        </span>
      ))}
    </div>
  );
  return (
    <section className="flex flex-col items-center gap-6 rounded-[2rem] border-2 border-dashed border-border px-6 py-10 text-center md:py-14">
      <div aria-hidden className="flex items-center gap-3 md:gap-5">
        <div className="-rotate-6">{sheet(t("collation.col.wall"), "bg-e-gov")}</div>
        <span className="grid size-11 place-items-center rounded-full bg-frame-2 text-frame-ink shadow-lift">
          <Scale className="size-5" />
        </span>
        <div className="rotate-6">{sheet(t("collation.col.announced"), "bg-e-pres")}</div>
      </div>
      <div className="flex max-w-md flex-col gap-2">
        <p className="display text-2xl">{t("collation.emptyBoard.title")}</p>
        <p className="text-sm text-muted">{t("collation.emptyBoard.body")}</p>
      </div>
    </section>
  );
}

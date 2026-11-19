"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Camera, CircleCheck, Radio, Scale, TriangleAlert } from "lucide-react";
import { ELECTIONS, type Election } from "@/lib/elections";
import type { FeedEvent, FeedKind } from "@/lib/feed";
import { photoUrl, shortHash, signed } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";

const POLL_MS = 20_000;
const PAGE = 8;

// "Now", rounded to 30 s so the snapshot stays stable between ticks. 0 on the server: no
// relative times are rendered until the browser takes over (no clock reads while prerendering).
const subscribeNow = (cb: () => void) => {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
};
const useNow = () => useSyncExternalStore(subscribeNow, () => Math.floor(Date.now() / 30_000) * 30_000, () => 0);

function ago(iso: string, now: number) {
  if (!now) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return t("feed.justNow");
  if (s < 3600) return t("feed.minutes", { n: Math.floor(s / 60) });
  if (s < 86_400) return t("feed.hours", { n: Math.floor(s / 3600) });
  return t("feed.days", { n: Math.floor(s / 86_400) });
}

const KINDS: { key: FeedKind | "all"; label: MessageKey }[] = [
  { key: "all", label: "feed.kind.all" },
  { key: "photo", label: "feed.kind.photo" },
  { key: "verified", label: "feed.kind.verified" },
  { key: "flagged", label: "feed.kind.flagged" },
  { key: "mismatch", label: "feed.kind.mismatch" },
];

/**
 * Live activity from every polling unit: sheets sealed, units verified, records that need
 * review and announced figures that don't match the wall. Polls every 20 s.
 */
export function LiveFeed() {
  const now = useNow();
  const [election, setElection] = useState<Election | "all">("all");
  const [kind, setKind] = useState<FeedKind | "all">("all");
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const seen = useRef(new Set<string>());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/feed?election=${election}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { events: FeedEvent[] };
        if (!active) return;
        // Only events that arrive after the first load get the "new" highlight.
        const first = seen.current.size === 0;
        const incoming = new Set(body.events.filter((e) => !seen.current.has(e.id)).map((e) => e.id));
        body.events.forEach((e) => seen.current.add(e.id));
        setFresh(first ? new Set() : incoming);
        setEvents(body.events);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => { active = false; window.clearInterval(id); };
  }, [election]);

  const list = (events ?? []).filter((e) => kind === "all" || e.kind === kind);

  return (
    <section id="live" className="panel scroll-mt-20 px-4 py-14 md:px-12 md:py-24">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-frame px-3.5 py-1.5 text-xs font-bold tracking-wide text-frame-ink uppercase">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-pop" />
              <span className="relative size-2 rounded-full bg-pop" />
            </span>
            {t("feed.live")}
          </span>
          <h2 className="display text-4xl text-balance md:text-6xl">{t("feed.title")}</h2>
          <p className="max-w-lg text-muted">{t("feed.body")}</p>
        </header>

        <div className="flex flex-col gap-3">
          <Chips
            label={t("election.label")}
            value={election}
            options={[["all", t("feed.allElections")], ...ELECTIONS.map((e) => [e, t(`election.${e}`)] as [Election, string])]}
            onChange={(v) => { setElection(v); setEvents(null); setShown(PAGE); seen.current.clear(); }}
          />
          <Chips label={t("feed.kind.label")} value={kind} options={KINDS.map((k) => [k.key, t(k.label)])} onChange={(v) => { setKind(v); setShown(PAGE); }} small />
        </div>

        {events === null && !failed ? (
          <ul className="flex flex-col gap-3" aria-label={t("common.loading")}>
            {[0, 1, 2].map((i) => <li key={i} className="card h-22 animate-pulse" />)}
          </ul>
        ) : failed && !events ? (
          <p className="rounded-2xl bg-review-bg p-4 text-center text-sm text-review-text">{t("feed.failed")}</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border px-6 py-12 text-center">
            <Radio aria-hidden className="size-8 text-muted" />
            <p className="font-semibold">{t("feed.empty")}</p>
            <a href="#report" className="btn btn-primary mt-1"><Camera aria-hidden className="size-4.5" /> {t("feed.beFirst")}</a>
          </div>
        ) : (
          <>
            <ol className="relative flex flex-col gap-3 before:absolute before:top-4 before:bottom-4 before:left-[1.85rem] before:w-px before:bg-border md:before:left-[2.1rem]">
              {list.slice(0, shown).map((e) => <Item key={e.id} e={e} now={now} fresh={fresh.has(e.id)} />)}
            </ol>
            {list.length > shown && (
              <button onClick={() => setShown((n) => n + PAGE)} className="btn btn-secondary self-center">{t("feed.more")}</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Chips<T extends string>({ label, value, options, onChange, small }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex justify-start gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:justify-center">
      {options.map(([v, l]) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`shrink-0 rounded-full border font-medium transition ${small ? "min-h-8 px-3 text-xs" : "min-h-10 px-4 text-sm"} ${
              active ? "border-text bg-text text-bg" : "border-border bg-surface text-muted hover:text-text"
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

const TONE = {
  photo: { icon: Camera, tile: "bg-accent text-black" },
  verified: { icon: CircleCheck, tile: "bg-brand text-brand-ink" },
  flagged: { icon: TriangleAlert, tile: "bg-review-bg text-review-text" },
  mismatch: { icon: Scale, tile: "bg-blush text-frame" },
} as const;

function Item({ e, now, fresh }: { e: FeedEvent; now: number; fresh: boolean }) {
  const { icon: Icon, tile } = TONE[e.kind];
  const href = e.kind === "photo" ? `/review/${e.photoId}` : `/units/${encodeURIComponent(e.unit.code)}?election=${e.election}`;
  const where = [e.unit.ward, e.unit.lga, e.unit.state].filter(Boolean).join(" · ");

  let headline: string;
  if (e.kind === "photo") headline = t("feed.photo", { unit: e.unit.name });
  else if (e.kind === "verified") headline = t("feed.verified", { unit: e.unit.name, n: e.witnesses });
  else if (e.kind === "flagged") headline = t("feed.flagged", { unit: e.unit.name });
  else headline = t("feed.mismatch", { party: e.party, unit: e.unit.name });

  return (
    <li className={`relative ${fresh ? "animate-pop-in" : "animate-rise"}`}>
      <Link href={href} className={`card pressable flex items-center gap-3 p-3 md:gap-4 md:p-4 ${fresh ? "ring-2 ring-pop" : ""}`}>
        <span className={`relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl md:size-12 ${tile}`}>
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="leading-snug font-semibold">{headline}</p>
          {e.kind === "mismatch" && (
            <p className="font-mono text-sm tabular-nums">
              {t("feed.wall")} {e.wall} → {t("feed.announced")} {e.announced}{" "}
              <span className="font-bold text-review-text">({signed(e.announced - e.wall)})</span>
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-text">{t(`election.${e.election}`)}</span>
            <span className="truncate">{e.unit.code}{where ? ` · ${where}` : ""}</span>
            {e.kind === "photo" && <span className="font-mono">{shortHash(e.hash)}</span>}
            {e.kind === "photo" && <span className={e.read ? "text-ok-text" : ""}>{e.read ? t("feed.read") : t("review.reading")}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {e.kind === "photo" && (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL, already compressed
            <img src={photoUrl(e.image)} alt="" loading="lazy" className="size-12 rounded-xl border border-border object-cover md:size-14" />
          )}
          <time dateTime={e.at} className="text-[11px] whitespace-nowrap text-muted">{ago(e.at, now)}</time>
        </div>
      </Link>
    </li>
  );
}

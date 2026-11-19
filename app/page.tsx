import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ArrowUpRight, Fingerprint } from "lucide-react";
import { ReportSheet } from "@/components/capture/ReportSheet";
import { LiveFeed } from "@/components/home/LiveFeed";
import { MatchDemo } from "@/components/home/MatchDemo";
import { DoodlePattern, SpinSticker } from "@/components/home/Sticker";
import { UnitCompare } from "@/components/home/UnitCompare";
import { QueueBadge } from "@/components/QueueBadge";
import { t, type MessageKey } from "@/lib/i18n";
import type { UnitStatus } from "@/lib/schemas";
import { many } from "@/lib/rows";
import { publicClient } from "@/lib/supabase/server";

export default function Home() {
  return (
    <>
      <Hero />
      <div className="flex flex-col gap-2 p-2 md:gap-3 md:p-3">
        <QueueBadge />
        <LiveFeed />
        <div className="mx-auto my-6 grid w-full max-w-6xl gap-3 px-2 md:my-14 md:grid-cols-2 md:gap-4 md:px-8">
          <SealPanel />
          <WitnessPanel />
        </div>
        <DemoPanel />
        <RolesPanel />
      </div>
    </>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-frame-2 px-4 pt-12 pb-16 text-center text-frame-ink md:px-10 md:pt-20 md:pb-24">
      <DoodlePattern id="hero-doodles" className="text-frame-ink opacity-[0.06]" />

      <div className="relative mx-auto max-w-5xl">
        <h1 className="display text-[3.1rem] text-balance sm:text-7xl md:text-[6.5rem] animate-rise">
          {t("home.hero.title")}{" "}
          <span className="relative inline-block text-accent">
            {t("home.hero.title2")}
            <svg aria-hidden viewBox="0 0 220 14" className="absolute -bottom-1 left-0 h-3 w-full text-pop md:-bottom-2 md:h-4" preserveAspectRatio="none">
              <path d="M2 10 C 50 2, 120 2, 218 8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
        </h1>

        {/* The capture form, right where the eye lands: one tab per election */}
        <div id="report" className="relative mx-auto mt-10 max-w-2xl scroll-mt-24 animate-rise md:mt-14" style={{ animationDelay: "100ms" }}>
          <SpinSticker small text={t("home.sticker")} className="absolute -right-5 -bottom-8 z-10 hidden sm:grid md:-right-10 md:-bottom-10" />
          <div className="rounded-[1.75rem] bg-bg p-5 text-left text-text shadow-lift md:p-8">
            <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-surface-2" />}>
              <ReportSheet />
            </Suspense>
          </div>
        </div>

        <p className="mx-auto mt-12 max-w-xl text-base leading-relaxed text-frame-muted animate-rise md:mt-14 md:text-xl" style={{ animationDelay: "200ms" }}>
          {t("home.hero.body")}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 animate-rise sm:flex-row" style={{ animationDelay: "280ms" }}>
          <Link href="/units" className="btn btn-gold min-h-13 px-7 text-base">
            {t("home.browse")} <ArrowRight aria-hidden className="size-5" />
          </Link>
          <a href="#live" className="btn btn-outline-light min-h-13 px-7 text-base">
            {t("home.howLink")}
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Feature panels ───────────────────────────────────────────────── */

function SealPanel() {
  return (
    <section className="panel flex flex-col gap-6 overflow-hidden p-6 md:p-8">
      <div className="relative mx-auto h-56 w-full max-w-xs">
        {/* Blob holding a mini result sheet */}
        <div className="absolute top-0 left-0 h-44 w-48 rounded-[46%_54%_42%_58%/55%_45%_55%_45%] bg-frame-2 p-7">
          <div className="h-full w-full rotate-[-6deg] rounded-xl bg-bg p-3.5 shadow-lift">
            <div className="h-2 w-14 rounded-full bg-text/80" />
            {[80, 64, 72, 56].map((w, i) => (
              <div key={i} className="mt-2.5 flex items-center gap-2">
                <span className="h-1.5 rounded-full bg-muted/40" style={{ width: `${w}%` }} />
                <span className="font-mono text-[8px] font-bold text-muted">{[131, 142, 98, 26][i]}</span>
              </div>
            ))}
          </div>
        </div>
        {/* The sticker */}
        <div
          className="absolute right-0 bottom-0 flex w-40 flex-col gap-1 rounded-2xl bg-pop p-4 text-frame shadow-lift animate-wobble"
          style={{ "--tilt": "-8deg" } as React.CSSProperties}
        >
          <Fingerprint aria-hidden className="size-5" />
          <span className="display text-3xl">SHA-256</span>
          <span className="font-display text-xs font-bold">{t("home.seal.sticker")}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="display text-3xl md:text-4xl">{t("home.seal.title")}</h2>
        <p className="text-sm leading-relaxed text-muted">{t("home.seal.body")}</p>
      </div>
    </section>
  );
}

function WitnessPanel() {
  return (
    <section className="panel flex flex-col gap-6 overflow-hidden p-6 md:p-8">
      <div className="relative mx-auto h-56 w-full max-w-xs">
        <PhotoBlob label={t("unit.witness", { n: 1 })} className="top-1 left-0 rotate-[-7deg]" shape="rounded-[58%_42%_50%_50%/45%_55%_45%_55%]" />
        <PhotoBlob label={t("unit.witness", { n: 2 })} className="top-10 right-0 rotate-[6deg]" shape="rounded-[42%_58%_55%_45%/55%_45%_55%_45%]" />
        <span
          aria-hidden
          className="absolute -top-1 right-4 grid size-16 place-items-center rounded-[1.2rem] bg-accent text-3xl shadow-lift animate-wobble"
          style={{ "--tilt": "12deg" } as React.CSSProperties}
        >
          ✌️
        </span>
        <Suspense fallback={null}>
          <LiveCount />
        </Suspense>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="display text-3xl md:text-4xl">{t("home.two.title")}</h2>
        <p className="text-sm leading-relaxed text-muted">{t("home.two.body")}</p>
      </div>
    </section>
  );
}

function PhotoBlob({ label, className, shape }: { label: string; className: string; shape: string }) {
  return (
    <div className={`absolute h-36 w-36 overflow-hidden bg-frame-2 p-4 shadow-lift ${shape} ${className}`}>
      <div className="h-full w-full rounded-lg bg-bg p-2.5">
        <div className="h-1.5 w-9 rounded-full bg-text/80" />
        {[70, 50, 60].map((w, i) => <div key={i} className="mt-2 h-1.5 rounded-full bg-muted/40" style={{ width: `${w}%` }} />)}
        <span className="mt-3 inline-flex rounded-full bg-ok-bg px-1.5 py-0.5 text-[9px] font-bold text-ok-text">{label} ✓</span>
      </div>
    </div>
  );
}

type Row = { unit_results: { status: UnitStatus } | { status: UnitStatus }[] | null };

/** Live "x of y verified" pill pinned to the witness illustration. A unit counts once any of its elections is verified. */
async function LiveCount() {
  await connection();
  const { data } = await publicClient().from("polling_units").select("unit_results(status)").limit(5000).returns<Row[]>();
  if (!data?.length) return null;
  const v = data.filter((u) => many(u.unit_results).some((r) => r.status === "verified")).length;
  return (
    <Link
      href="/units?status=verified"
      className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shadow-lift"
    >
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-pop" />
        <span className="relative size-2 rounded-full bg-brand" />
      </span>
      {t("home.two.live", { v, n: data.length })}
    </Link>
  );
}

/* ── Interactive demo ─────────────────────────────────────────────── */

function DemoPanel() {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-brand px-3 py-14 md:rounded-[2.25rem] md:px-10 md:py-24">
      <DoodlePattern id="demo-doodles" className="text-white opacity-[0.12]" />
      {/* Confetti shapes */}
      <span aria-hidden className="absolute top-10 left-[8%] size-16 rotate-12 rounded-2xl bg-accent md:size-24" />
      <span aria-hidden className="absolute right-[6%] bottom-12 size-20 rounded-full bg-blush md:size-28" />
      <span aria-hidden className="absolute top-[45%] right-[12%] hidden size-10 rotate-45 bg-pop md:block" />

      <div className="relative mx-auto max-w-4xl rounded-[2rem] bg-bg px-5 py-10 md:rounded-[3rem] md:px-14 md:py-16">
        <div className="mb-10 text-center">
          <h2 className="display text-4xl text-balance md:text-6xl">{t("home.demo.title")}</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">{t("home.demo.body")}</p>
        </div>
        <UnitCompare>
          <MatchDemo />
        </UnitCompare>
      </div>
    </section>
  );
}

/* ── Roles ────────────────────────────────────────────────────────── */

function RolesPanel() {
  const roles: { emoji: string; href: string; title: MessageKey; body: MessageKey; tint: string; tilt: number }[] = [
    { emoji: "📸", href: "/capture", title: "home.role.witness.title", body: "home.role.witness.body", tint: "bg-accent", tilt: -6 },
    { emoji: "📣", href: "/collation", title: "home.role.agent.title", body: "home.role.agent.body", tint: "bg-blush", tilt: 5 },
    { emoji: "👀", href: "/units", title: "home.role.observer.title", body: "home.role.observer.body", tint: "bg-pop", tilt: -4 },
  ];
  return (
    <section className="panel p-5 md:p-10">
      <h2 className="display mb-6 px-1 text-4xl md:mb-8 md:text-5xl">{t("home.roles.title")}</h2>
      <ul className="grid gap-3 stagger md:grid-cols-3 md:gap-4">
        {roles.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="card pressable group flex h-full flex-col gap-5 p-6">
              <div className="flex items-start justify-between">
                <span
                  aria-hidden
                  className={`grid size-14 place-items-center rounded-2xl text-3xl transition group-hover:rotate-0 ${r.tint}`}
                  style={{ transform: `rotate(${r.tilt}deg)` }}
                >
                  {r.emoji}
                </span>
                <ArrowUpRight aria-hidden className="size-6 text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-xl font-bold tracking-tight">{t(r.title)}</h3>
                <p className="text-sm leading-relaxed text-muted">{t(r.body)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

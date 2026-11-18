import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Camera, ChevronRight, Images, MapPin, Scale, SearchX, ShieldCheck } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import { Card } from "@/components/Card";
import { DiffTable } from "@/components/DiffTable";
import { EmptyState } from "@/components/EmptyState";
import { FiguresTable } from "@/components/FiguresTable";
import { FlagList } from "@/components/FlagList";
import { HashChip } from "@/components/HashChip";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import { formatTime, photoUrl } from "@/lib/format";
import { t } from "@/lib/i18n";
import { checkResult } from "@/lib/rules/checks";
import { readingKey } from "@/lib/rules/consensus";
import { diffScores } from "@/lib/rules/diff";
import { SolidarityPanel } from "@/components/solidarity/SafetyPanel";
import { SOLIDARITY_ENABLED } from "@/lib/solidarity/config";
import { ExtractedResult, PartyScores, type UnitStatus } from "@/lib/schemas";
import { publicClient } from "@/lib/supabase/server";

export default function UnitPage({ params }: PageProps<"/units/[code]">) {
  return (
    <>
      <BackLink href="/units" label={t("units.title")} />
      <Suspense fallback={<div className="flex flex-col gap-4">{[40, 56, 64].map((h) => <div key={h} className="card animate-pulse" style={{ height: h * 4 }} />)}</div>}>
        <Unit params={params} />
      </Suspense>
    </>
  );
}

type UnitRow = {
  id: string;
  code: string;
  name: string;
  ward: string;
  lga: string;
  is_simulated: boolean;
  unit_results: { status: UnitStatus; witness_count: number; agreed_scores: unknown; verified_at: string | null } | null;
  result_photos: {
    id: string;
    user_id: string;
    image_url: string;
    sha256_hash: string;
    hash_verified: boolean | null;
    captured_at: string;
    uploaded_at: string;
    extracted_results: Record<string, unknown> | null;
  }[];
  collation_results: { id: string; level: string; party_scores: unknown; source: string; announced_at: string; is_simulated: boolean }[];
};

async function Unit({ params }: Pick<PageProps<"/units/[code]">, "params">) {
  await connection();
  const { code } = await params;
  const { data: unit } = await publicClient()
    .from("polling_units")
    .select(
      `id, code, name, ward, lga, is_simulated,
       unit_results(status, witness_count, agreed_scores, verified_at),
       result_photos(id, user_id, image_url, sha256_hash, hash_verified, captured_at, uploaded_at, extracted_results(*)),
       collation_results(id, level, party_scores, source, announced_at, is_simulated)`,
    )
    .eq("code", decodeURIComponent(code))
    .order("uploaded_at", { referencedTable: "result_photos" })
    .order("announced_at", { referencedTable: "collation_results", ascending: false })
    .maybeSingle<UnitRow>();

  if (!unit) return <EmptyState icon={SearchX} title={t("unit.notFound")} />;

  const status = unit.unit_results?.status ?? "pending";
  const witnesses = unit.unit_results?.witness_count ?? 0;
  const agreed = status === "verified" ? ExtractedResult.parse(unit.unit_results?.agreed_scores) : null;
  const agreedKey = agreed ? readingKey(agreed) : null;
  // Number witnesses by first appearance, never by name or id.
  const witnessNo = new Map<string, number>();
  for (const p of unit.result_photos) if (!witnessNo.has(p.user_id)) witnessNo.set(p.user_id, witnessNo.size + 1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5">
      <header className="card flex flex-col gap-4 p-5 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-medium text-muted">{unit.code}</span>
            {unit.is_simulated && (
              <span className="rounded-md bg-sim-bg px-2 py-0.5 text-[10px] font-bold tracking-wide text-sim-text">{t("common.simulated")}</span>
            )}
          </div>
          <StatusBadge status={status} />
        </div>
        <div>
          <h1 className="display text-3xl md:text-4xl">{unit.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <MapPin aria-hidden className="size-4" /> {unit.ward} · {unit.lga}
          </p>
        </div>
        <div className="border-t border-border pt-4">
          {status === "flagged" ? (
            <p className="text-sm text-review-text">{t("status.flagged.detail")}</p>
          ) : (
            <WitnessMeter count={witnesses} status={status} />
          )}
        </div>
      </header>

      <Link href={`/capture?unit=${encodeURIComponent(unit.code)}`} className="btn btn-primary min-h-14 text-base">
        <Camera aria-hidden className="size-5" /> {t("unit.addPhoto")}
      </Link>
      </div>

      <div className="flex flex-col gap-5">

      {SOLIDARITY_ENABLED && <SolidarityPanel unitId={unit.id} code={unit.code} />}

      <Card title={t("unit.wallResult")} icon={ShieldCheck}>
        {agreed ? (
          <>
            <FiguresTable result={agreed} />
            <FlagList flags={checkResult(agreed)} />
            {unit.unit_results?.verified_at && (
              <p className="text-xs text-muted">{t("unit.verifiedAt", { time: formatTime(unit.unit_results.verified_at) })}</p>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{status === "flagged" ? t("unit.flaggedHint") : t("unit.pendingHint")}</p>
        )}
      </Card>

      <Card title={t("unit.compare")} icon={Scale}>
        {unit.collation_results.length === 0 && <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("unit.noCollation")}</p>}
        {unit.collation_results.length > 0 && !agreed && <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("unit.waitingForWall")}</p>}
        {agreed &&
          unit.collation_results.map((c) => (
            <DiffTable
              key={c.id}
              diffs={diffScores(agreed.party_scores, PartyScores.parse(c.party_scores))}
              source={`${c.source} · ${t(`level.${c.level}` as "level.ward")}`}
              announcedAt={formatTime(c.announced_at)}
              wallAccredited={agreed.accredited}
            />
          ))}
      </Card>

      <Card title={t("unit.photos", { n: unit.result_photos.length })} icon={Images}>
        <ul className="grid gap-2 md:grid-cols-2">
          {unit.result_photos.map((p) => {
            const reading = p.extracted_results ? ExtractedResult.parse(p.extracted_results) : null;
            const matches = reading && agreedKey ? readingKey(reading) === agreedKey : null;
            return (
              <li key={p.id}>
                <Link href={`/review/${p.id}`} className="-mx-2 flex gap-3 rounded-2xl p-2 transition hover:bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, already compressed */}
                  <img src={photoUrl(p.image_url)} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl border border-border object-cover" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {t("unit.witness", { n: witnessNo.get(p.user_id) ?? 0 })}
                      {matches === true && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok-text">{t("unit.readingMatches")}</span>}
                      {matches === false && <span className="rounded-full bg-review-bg px-2 py-0.5 text-xs font-medium text-review-text">{t("unit.readingDiffers")}</span>}
                      {!reading && <span className="text-xs font-normal text-muted">{t("review.reading")}</span>}
                    </span>
                    <span className="text-xs text-muted">{t("time.captured")}: {formatTime(p.captured_at)}</span>
                    <HashChip hash={p.sha256_hash} verified={p.hash_verified} />
                  </div>
                  <ChevronRight aria-hidden className="size-4 self-center text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      </div>
    </div>
  );
}

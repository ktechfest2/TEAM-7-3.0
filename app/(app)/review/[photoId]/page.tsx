import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Fingerprint, ListChecks, LoaderCircle, ScanText, SearchX } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { SheetReading } from "@/components/SheetReading";
import { FlagList } from "@/components/FlagList";
import { HashChip } from "@/components/HashChip";
import { ReadAgainButton } from "@/components/ReadAgainButton";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import { parseElection } from "@/lib/elections";
import { formatTime, photoUrl } from "@/lib/format";
import { t } from "@/lib/i18n";
import { CheckFlags, type UnitStatus } from "@/lib/schemas";
import { publicClient } from "@/lib/supabase/server";

export default function ReviewPage({ params }: PageProps<"/review/[photoId]">) {
  return (
    <>
      <BackLink href="/queue" label={t("queue.title")} />
      <Suspense fallback={<div className="flex flex-col gap-4">{[32, 64, 48].map((h) => <div key={h} className="card animate-pulse" style={{ height: h * 4 }} />)}</div>}>
        <Review params={params} />
      </Suspense>
    </>
  );
}

type PhotoRow = {
  id: string;
  image_url: string;
  sha256_hash: string;
  hash_verified: boolean | null;
  captured_at: string;
  uploaded_at: string;
  sync_status: string;
  unit_id: string;
  election: string;
  polling_units: { id: string; code: string; name: string; ward: string; lga: string; state: string };
  extracted_results: Record<string, unknown> | null;
};

async function Review({ params }: Pick<PageProps<"/review/[photoId]">, "params">) {
  await connection();
  const { photoId } = await params;
  const db = publicClient();
  const { data: photo } = await db
    .from("result_photos")
    .select(
      "id, unit_id, election, image_url, sha256_hash, hash_verified, captured_at, uploaded_at, sync_status, polling_units(id, code, name, ward, lga, state), extracted_results(*)",
    )
    .eq("id", photoId)
    .maybeSingle<PhotoRow>();

  if (!photo) return <EmptyState icon={SearchX} title={t("review.notFound")} />;
  const election = parseElection(photo.election);
  const { data: unitResult } = await db
    .from("unit_results")
    .select("status, witness_count")
    .eq("unit_id", photo.unit_id)
    .eq("election", election)
    .maybeSingle<{ status: UnitStatus; witness_count: number }>();
  const unit = photo.polling_units;
  const x = photo.extracted_results;
  const flags = x ? CheckFlags.parse(x.check_flags) : [];
  const status = unitResult?.status ?? "pending";

  return (
    <>
      <header className="flex flex-col gap-1.5 animate-rise">
        <span className="eyebrow">{unit.code} · {t(`election.${election}`)}</span>
        <h1 className="display text-4xl text-balance md:text-6xl">{t("review.title")}</h1>
      </header>

      <Link href={`/units/${unit.code}?election=${election}`} className="card pressable flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="eyebrow block">{t("review.unitStatus")}</span>
            <span className="block truncate font-semibold">{unit.name}</span>
          </span>
          <StatusBadge status={status} size="sm" />
        </div>
        <div className="flex items-center justify-between">
          <WitnessMeter count={unitResult?.witness_count ?? 0} status={status} />
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
            {t("review.viewUnit")} <ArrowRight aria-hidden className="size-4" />
          </span>
        </div>
      </Link>

      <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5">
      {x ? (
        <>
          <Card title={t("review.numbers")} icon={ScanText}>
            <SheetReading raw={x.raw} fallback={x} unit={unit} />
            <p className="text-xs text-muted">
              {t("review.readBy", { model: String(x?.model), confidence: Math.round(Number(x?.ai_confidence ?? 0) * 100) })}
            </p>
          </Card>
          <Card title={t("review.checks")} icon={ListChecks}>
            <FlagList flags={flags} />
            {flags.some((f) => f.severity === "blocking") && <ReadAgainButton photoId={photo.id} />}
          </Card>
        </>
      ) : (
        <Card title={t("review.numbers")} icon={ScanText}>
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">
            {photo.sync_status !== "failed" && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {photo.sync_status === "failed" ? t("review.failed") : t("review.reading")}
          </p>
        </Card>
      )}

      </div>
      <div>
      <Card title={t("review.evidence")} icon={Fingerprint}>
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, already compressed */}
        <img src={photoUrl(photo.image_url)} alt={t("review.photoAlt")} loading="lazy" className="w-full rounded-xl border border-border" />
        <HashChip hash={photo.sha256_hash} verified={photo.hash_verified} full />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <dt className="text-muted">{t("time.captured")}</dt>
          <dd className="text-right font-medium">{formatTime(photo.captured_at)}</dd>
          <dt className="text-muted">{t("time.received")}</dt>
          <dd className="text-right font-medium">{formatTime(photo.uploaded_at)}</dd>
        </dl>
      </Card>
      </div>
      </div>
    </>
  );
}

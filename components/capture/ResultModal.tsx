"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { FlagList } from "@/components/FlagList";
import { HashChip } from "@/components/HashChip";
import { ReadAgainButton } from "@/components/ReadAgainButton";
import { Modal } from "@/components/Modal";
import { SheetReading, type ChosenUnit } from "@/components/SheetReading";
import { StatusBadge, WitnessMeter } from "@/components/StatusBadge";
import { t } from "@/lib/i18n";
import { CheckFlags, type CheckFlag, type UnitStatus } from "@/lib/schemas";
import { browserClient } from "@/lib/supabase/browser";

type Loaded = {
  unit: ChosenUnit;
  hash: string;
  hashVerified: boolean | null;
  raw: unknown;
  stored: unknown;
  flags: CheckFlag[];
  status: UnitStatus;
  witnesses: number;
};

type Props = { photoId: string | null; error?: string | null; onClose: () => void; onRetake: () => void; onRetry?: () => void };

/** Pops in when a sheet has been read: the whole transcription, rule checks and the unit's status. */
export function ResultModal({ photoId, error, onClose, onRetake, onRetry }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0); // bumps after "Read again" to reload the reading

  useEffect(() => {
    if (!photoId) return;
    let active = true;
    void (async () => {
      const db = browserClient();
      const { data: photo } = await db
        .from("result_photos")
        .select("unit_id, election, sha256_hash, hash_verified, polling_units(code, name, ward, lga, state), extracted_results(*)")
        .eq("id", photoId)
        .maybeSingle();
      if (!active) return;
      const x = (Array.isArray(photo?.extracted_results) ? photo.extracted_results[0] : photo?.extracted_results) as Record<string, unknown> | null;
      if (!photo || !x) return setLoadError(true);
      const { data: ur } = await db
        .from("unit_results")
        .select("status, witness_count")
        .eq("unit_id", photo.unit_id)
        .eq("election", photo.election)
        .maybeSingle();
      if (!active) return;
      const unit = (Array.isArray(photo.polling_units) ? photo.polling_units[0] : photo.polling_units) as ChosenUnit;
      setData({
        unit,
        hash: photo.sha256_hash,
        hashVerified: photo.hash_verified,
        raw: x.raw,
        stored: x,
        flags: CheckFlags.safeParse(x.check_flags).data ?? [],
        status: (ur?.status as UnitStatus) ?? "pending",
        witnesses: ur?.witness_count ?? 1,
      });
    })().catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [photoId, version]);

  const failed = !!error || loadError;

  return (
    <Modal title={failed ? t("result.failedTitle") : t("result.title")} onClose={onClose}>
      {(close) => (
        <>
          {failed ? (
            <p className="flex gap-2 rounded-2xl bg-review-bg p-4 text-sm text-review-text">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {error ?? t("review.failed")}
            </p>
          ) : !data ? (
            <div className="flex flex-col items-center gap-3 py-10 text-muted">
              <Loader2 aria-hidden className="size-7 animate-spin" />
              <p className="text-sm">{t("common.loading")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted">{data.unit.code}</p>
                  <p className="truncate font-semibold">{data.unit.name}</p>
                  <div className="mt-1"><WitnessMeter count={data.witnesses} status={data.status} /></div>
                </div>
                <StatusBadge status={data.status} size="sm" />
              </div>
              <SheetReading raw={data.raw} fallback={data.stored} unit={data.unit} />
              <div className="flex flex-col gap-2">
                <h3 className="eyebrow">{t("review.checks")}</h3>
                <FlagList flags={data.flags} />
                {data.flags.some((f) => f.severity === "blocking") && photoId && (
                  <ReadAgainButton photoId={photoId} onDone={() => { setData(null); setVersion((v) => v + 1); }} />
                )}
              </div>
              <div className="flex items-center gap-2 text-ok-text">
                <ShieldCheck aria-hidden className="size-4 shrink-0" />
                <HashChip hash={data.hash} verified={data.hashVerified} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { close(); onRetake(); }} className="btn btn-secondary min-h-13">
              <RotateCcw aria-hidden className="size-4.5" /> {t("capture.retake")}
            </button>
            {failed && onRetry ? (
              <button onClick={() => { close(); onRetry(); }} className="btn btn-primary min-h-13">{t("result.retry")}</button>
            ) : (
              <button onClick={close} className="btn btn-primary min-h-13">{t("result.done")}</button>
            )}
          </div>
          {photoId && !failed && (
            <Link href={`/review/${photoId}`} className="-mt-1 inline-flex items-center justify-center gap-1 self-center text-sm font-semibold text-brand">
              {t("result.full")} <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </>
      )}
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, Inbox, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { CaptureStatus } from "@/components/CaptureStatus";
import { openFinalizePrompt } from "@/components/FinalizePrompt";
import { EmptyState } from "@/components/EmptyState";
import { HashChip } from "@/components/HashChip";
import { formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useCaptures, useOnline } from "@/lib/offline/hooks";
import { cachedUnits, updateCapture } from "@/lib/offline/queue";
import { MAX_ATTEMPTS, syncAll } from "@/lib/offline/sync";

export function QueueClient() {
  const captures = useCaptures();
  const online = useOnline();
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void cachedUnits().then((us) => setCodes(Object.fromEntries(us.map((u) => [u.id, u.code]))));
  }, []);

  async function syncNow() {
    setSyncing(true);
    // A manual sync gives failed items a fresh set of attempts.
    for (const c of captures ?? []) if (c.attempts >= MAX_ATTEMPTS) await updateCapture(c.localId, { attempts: 0 });
    await syncAll();
    setSyncing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex items-center justify-between gap-3 p-3 pl-4">
        <span className={`inline-flex items-center gap-2 text-sm font-medium ${online ? "text-ok-text" : "text-review-text"}`}>
          <span className="relative flex size-2.5">
            {online && <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60" />}
            <span className={`relative size-2.5 rounded-full ${online ? "bg-brand" : "bg-accent"}`} />
          </span>
          {online ? <Wifi aria-hidden className="size-4" /> : <WifiOff aria-hidden className="size-4" />}
          {online ? t("queue.online") : t("queue.offline")}
        </span>
        <button onClick={syncNow} disabled={!online || syncing} className="btn btn-primary min-h-10 shrink-0 px-4 text-sm shadow-none">
          <RefreshCw aria-hidden className={`size-4 ${syncing ? "animate-spin" : ""}`} /> {t("queue.syncNow")}
        </button>
      </div>

      {captures?.length === 0 && (
        <EmptyState icon={Inbox} title={t("queue.empty")} body={t("queue.empty.body")}>
          <Link href="/capture" className="btn btn-primary mt-2">
            <Camera aria-hidden className="size-5" /> {t("home.capture")}
          </Link>
        </EmptyState>
      )}

      <ul className="flex flex-col gap-3 stagger">
        {captures?.map((c) => (
          <li key={c.localId} className="card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{codes[c.unitId] ?? c.unitCode ?? "—"}</span>
                <span className="text-xs font-medium text-muted">{t(`election.${c.election ?? "presidential"}`)}</span>
              </span>
              <span className="text-xs text-muted">{formatTime(c.capturedAt)}</span>
            </div>
            <HashChip hash={c.sha256} />
            <div className="flex items-center justify-between gap-2">
              <CaptureStatus item={c} online={online} />
              {c.status === "draft" && online && (
                <button onClick={openFinalizePrompt} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  {t("draft.finish")} <ArrowRight aria-hidden className="size-4" />
                </button>
              )}
              {c.status === "done" && c.photoId && (
                <Link href={`/review/${c.photoId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  {t("capture.seeResult")} <ArrowRight aria-hidden className="size-4" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

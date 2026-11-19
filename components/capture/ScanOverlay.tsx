"use client";

import { CloudOff, ScanLine } from "lucide-react";
import { t } from "@/lib/i18n";
import type { QueuedCapture } from "@/lib/schemas";

const STEP: Record<QueuedCapture["status"], { label: Parameters<typeof t>[0]; pct: number }> = {
  draft: { label: "scan.sealed", pct: 15 },
  queued: { label: "scan.sealed", pct: 15 },
  uploading: { label: "scan.uploading", pct: 40 },
  uploaded: { label: "scan.uploading", pct: 55 },
  extracting: { label: "scan.reading", pct: 80 },
  done: { label: "scan.done", pct: 100 },
  failed: { label: "scan.failed", pct: 100 },
};

/** The sealed photo with a sweeping scan line while it uploads and the whole sheet is read. */
export function ScanOverlay({ url, status, online }: { url: string; status: QueuedCapture["status"] | undefined; online: boolean }) {
  const waiting = !online && status !== "done";
  const step = STEP[status ?? "queued"];
  const active = !waiting && status !== "failed" && status !== "done";

  return (
    <section aria-live="polite" className="flex flex-col gap-3 animate-rise">
      <div className="relative overflow-hidden rounded-[1.25rem] border border-border bg-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img src={url} alt={t("capture.previewAlt")} className={`max-h-[50vh] w-full object-contain transition duration-700 ${active ? "opacity-80 saturate-50" : ""}`} />
        {active && (
          <>
            <div aria-hidden className="scan-grid pointer-events-none absolute inset-0" />
            <div aria-hidden className="scan-line pointer-events-none absolute inset-x-0 h-24" />
            {["top-3 left-3 border-t-4 border-l-4 rounded-tl-xl", "top-3 right-3 border-t-4 border-r-4 rounded-tr-xl", "bottom-3 left-3 border-b-4 border-l-4 rounded-bl-xl", "right-3 bottom-3 border-r-4 border-b-4 rounded-br-xl"].map((c) => (
              <span key={c} aria-hidden className={`absolute size-8 animate-pulse border-pop ${c}`} />
            ))}
          </>
        )}
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-sm font-medium text-white backdrop-blur">
          {waiting ? <CloudOff aria-hidden className="size-4 shrink-0" /> : <ScanLine aria-hidden className={`size-4 shrink-0 ${active ? "animate-pulse text-pop" : ""}`} />}
          <span className="truncate">{waiting ? t("scan.offline") : t(step.label)}</span>
        </div>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${waiting ? 15 : step.pct}%` }} />
      </div>
    </section>
  );
}

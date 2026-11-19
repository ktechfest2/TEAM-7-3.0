"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Camera, CloudOff, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { CameraSheet } from "@/components/capture/CameraSheet";
import { ResultModal } from "@/components/capture/ResultModal";
import { ScanOverlay } from "@/components/capture/ScanOverlay";
import { UnitPickerFields, useUnitPicker } from "@/components/capture/UnitPicker";
import { HashChip } from "@/components/HashChip";
import type { Election } from "@/lib/elections";
import { sha256Hex } from "@/lib/hash";
import { newId } from "@/lib/id";
import type { JpegPhoto } from "@/lib/image";
import { t } from "@/lib/i18n";
import { useCaptures, useOnline } from "@/lib/offline/hooks";
import { enqueue, updateCapture } from "@/lib/offline/queue";
import { syncAll } from "@/lib/offline/sync";

const noop = () => () => {};
/** False on a plain-http link (e.g. a laptop's Wi-Fi IP), where phones disable offline use. */
const useSecure = () => useSyncExternalStore(noop, () => window.isSecureContext, () => true);

/** A photo that has been sealed and queued: shown with the scan animation until it is read. */
type Scan = { localId: string; url: string };
/** A photo taken offline without a polling unit: saved, to be finished when the network is back. */
type Saved = { url: string; sha256: string };

/**
 * State → LGA → Ward → Polling unit, then photograph. The photo is sealed and sent at once;
 * a scan animation runs while the whole sheet is read, then the reading pops up in a modal.
 *
 * Offline, the camera never waits for the polling unit list: if no unit is chosen the photo
 * is sealed and saved as a draft, and when the network comes back a prompt asks the witness
 * to add the unit and send it (components/FinalizePrompt.tsx).
 */
export function CaptureForm({ election, onBusyChange }: { election: Election; onBusyChange?: (busy: boolean) => void }) {
  const params = useSearchParams();
  const online = useOnline();
  const captures = useCaptures();
  const picker = useUnitPicker(online, params.get("unit"));
  const { unitId, unitCode, unitName, ready } = picker.selection;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [round, setRound] = useState(0); // bumps on retry, so a new result can pop up again
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null); // photo id of the last sheet read
  const [cameraOpen, setCameraOpen] = useState(false);
  // Offline and no unit chosen: the photo is saved as a draft instead.
  const asDraft = !online && !ready;
  const secure = useSecure();

  const current = scan ? captures?.find((c) => c.localId === scan.localId) : undefined;
  const modalKey = scan ? `${scan.localId}#${round}` : null;
  const finished = current?.status === "done" || current?.status === "failed";
  const showModal = !!scan && finished && dismissed !== modalKey;
  const scanning = !!scan && !finished && (online || current?.status !== "queued");

  useEffect(() => onBusyChange?.(busy || scanning), [busy, scanning, onBusyChange]);

  /** Photo taken: compress, seal (SHA-256), queue and send straight away. */
  async function onPhoto(photo: JpegPhoto) {
    setCameraOpen(false);
    if (!ready && online) return;
    const capturedAt = new Date().toISOString(); // device clock, at the moment of capture
    setBusy(true);
    setError(null);
    try {
      // Already scaled and encoded once by the camera; these exact bytes are hashed, saved and uploaded.
      const sha256 = await sha256Hex(photo.bytes);
      const localId = newId();
      if (!ready) {
        // Saved straight to the phone; FinalizePrompt asks for the unit when the network is back.
        await enqueue({ localId, unitId: "", election, sha256, capturedAt, status: "draft", attempts: 0 }, photo.bytes);
        setSaved({ url: photo.dataUrl, sha256 });
        return;
      }
      await enqueue({ localId, unitId, unitCode, election, sha256, capturedAt, status: "queued", attempts: 0 }, photo.bytes);
      setSaved(null);
      setScan({ localId, url: photo.dataUrl });
      setDismissed(null);
      void syncAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function closeResult() {
    if (current?.photoId && current.status === "done") setLast(current.photoId);
    setDismissed(modalKey);
    setScan(null);
  }

  async function retry() {
    if (!scan) return;
    await updateCapture(scan.localId, { status: "queued", attempts: 0, error: undefined });
    setRound((r) => r + 1);
    void syncAll();
  }

  const locked = busy || scanning;

  return (
    <div className="flex flex-col gap-4">
      {cameraOpen && <CameraSheet title={unitName} onCapture={onPhoto} onClose={() => setCameraOpen(false)} />}

      {!secure && (
        <p role="status" className="flex gap-2 rounded-2xl bg-sim-bg px-3.5 py-3 text-xs text-sim-text">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span><span className="font-semibold">{t("secure.title")}. </span>{t("secure.body")}</span>
        </p>
      )}

      <UnitPickerFields picker={picker} locked={locked} />

      {scan ? (
        <>
          <ScanOverlay url={scan.url} status={current?.status} online={online} />
          {!scanning && !showModal && (
            <button onClick={() => setScan(null)} className="btn btn-secondary min-h-13">
              <Camera aria-hidden className="size-5" /> {t("capture.another")}
            </button>
          )}
        </>
      ) : saved ? (
        <section className="flex flex-col gap-3 rounded-[1.25rem] bg-ok-bg p-3 text-ok-text animate-pop-in" role="status">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img src={saved.url} alt={t("capture.previewAlt")} className="size-16 shrink-0 rounded-xl object-cover" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck aria-hidden className="size-4" /> {t("draft.saved")}</p>
              <p className="text-xs opacity-85">{t("draft.savedHint")}</p>
            </div>
          </div>
          <HashChip hash={saved.sha256} />
          <button onClick={() => setSaved(null)} className="btn btn-secondary min-h-12">
            <Camera aria-hidden className="size-5" /> {t("capture.another")}
          </button>
        </section>
      ) : (
        <>
          <button onClick={() => setCameraOpen(true)} disabled={(!ready && !asDraft) || busy} className="btn btn-primary min-h-15 w-full text-base">
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : asDraft ? <CloudOff aria-hidden className="size-5" /> : <Camera aria-hidden className="size-5" />}
            {busy ? t("capture.hashing") : asDraft ? t("draft.capture") : t("home.capture")}
          </button>
          {asDraft && <p className="-mt-1 text-center text-xs text-muted">{t("draft.captureHint")}</p>}
          {!ready && !asDraft && <p className="-mt-1 text-center text-xs text-muted">{t("capture.fillFirst")}</p>}
          {last && (
            <Link href={`/review/${last}`} className="flex items-center gap-2 rounded-2xl bg-ok-bg px-4 py-3 text-sm font-medium text-ok-text animate-rise">
              <ShieldCheck aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{t("capture.lastRead")}</span>
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </>
      )}

      {showModal && (
        <ResultModal
          key={modalKey}
          photoId={current?.status === "done" ? (current.photoId ?? null) : null}
          error={current?.status === "failed" ? (current.error ?? t("queue.failed")) : null}
          onClose={closeResult}
          onRetake={() => setCameraOpen(true)}
          onRetry={retry}
        />
      )}

      {error && <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{error}</p>}
    </div>
  );
}

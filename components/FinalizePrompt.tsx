"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Send, Trash2 } from "lucide-react";
import { StoredPhoto } from "@/components/StoredPhoto";
import { UnitPickerFields, useUnitPicker } from "@/components/capture/UnitPicker";
import { ElectionTabs } from "@/components/ElectionTabs";
import { HashChip } from "@/components/HashChip";
import { Modal } from "@/components/Modal";
import { DEFAULT_ELECTION, type Election } from "@/lib/elections";
import { formatTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useCaptures, useOnline } from "@/lib/offline/hooks";
import { deleteCapture, updateCapture } from "@/lib/offline/queue";
import { syncAll } from "@/lib/offline/sync";
import type { QueuedCapture } from "@/lib/schemas";

/** Fire this to open the prompt from anywhere (e.g. the upload queue's "Finish" button). */
export const FINALIZE_EVENT = "countrack:finalize";
export const openFinalizePrompt = () => window.dispatchEvent(new Event(FINALIZE_EVENT));

/**
 * Photos taken offline without a polling unit are saved as drafts. Whenever the network
 * comes back (and on load, if online) this pops up so the witness can add the unit and
 * election and send them. "Later" hides it until the next time the network returns.
 */
export function FinalizePrompt() {
  const online = useOnline();
  const captures = useCaptures();
  const drafts = useMemo(() => (captures ?? []).filter((c) => c.status === "draft").reverse(), [captures]);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    const back = () => setDismissed(false); // network returned: ask again
    const force = () => setDismissed(false);
    window.addEventListener("online", back);
    window.addEventListener(FINALIZE_EVENT, force);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener(FINALIZE_EVENT, force);
    };
  }, []);

  const open = !dismissed && online && (drafts.length > 0 || sent > 0);
  if (!open) return null;

  const close = () => { setDismissed(true); setSent(0); };
  const draft = drafts[0];

  return (
    <Modal title={draft ? t("draft.title", { n: drafts.length }) : t("draft.allSent")} onClose={close}>
      {(dismiss) =>
        draft ? (
          <DraftForm
            key={draft.localId}
            draft={draft}
            remaining={drafts.length}
            onSent={() => setSent((n) => n + 1)}
            onLater={dismiss}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-ok-bg text-ok-text animate-pop-in">
              <CircleCheck aria-hidden className="size-8" />
            </span>
            <p className="max-w-xs text-muted">{t("draft.allSentHint", { n: sent })}</p>
            <div className="grid w-full grid-cols-2 gap-3">
              <Link href="/queue" onClick={dismiss} className="btn btn-secondary min-h-12">{t("queue.title")} <ArrowRight aria-hidden className="size-4" /></Link>
              <button onClick={dismiss} className="btn btn-primary min-h-12">{t("result.done")}</button>
            </div>
          </div>
        )
      }
    </Modal>
  );
}

function DraftForm({ draft, remaining, onSent, onLater }: { draft: QueuedCapture; remaining: number; onSent: () => void; onLater: () => void }) {
  const picker = useUnitPicker(true);
  const [election, setElection] = useState<Election>(draft.election ?? DEFAULT_ELECTION);
  const [busy, setBusy] = useState(false);
  const { unitId, unitCode, ready } = picker.selection;

  async function send() {
    setBusy(true);
    await updateCapture(draft.localId, { unitId, unitCode, election, status: "queued", attempts: 0, error: undefined });
    onSent();
    void syncAll();
  }

  async function discard() {
    if (!window.confirm(t("draft.deleteConfirm"))) return;
    await deleteCapture(draft.localId);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("draft.body")}</p>
      <div className="flex gap-3 rounded-2xl bg-surface p-3 shadow-card">
        <StoredPhoto localId={draft.localId} alt={t("capture.previewAlt")} className="h-28 w-22 shrink-0 rounded-xl border border-border bg-surface-2 object-cover" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm font-semibold">{t("capture.capturedAt", { time: formatTime(draft.capturedAt) })}</p>
          <HashChip hash={draft.sha256} />
          {remaining > 1 && <p className="text-xs text-muted">{t("draft.more", { n: remaining - 1 })}</p>}
        </div>
      </div>

      <ElectionTabs value={election} onChange={setElection} disabled={busy} />
      <UnitPickerFields picker={picker} locked={busy} showArea={false} />

      <button onClick={send} disabled={!ready || busy} className="btn btn-primary min-h-14 text-base">
        <Send aria-hidden className="size-5" /> {t("draft.send")}
      </button>
      <div className="flex items-center justify-between">
        <button onClick={discard} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-review-text">
          <Trash2 aria-hidden className="size-4" /> {t("draft.delete")}
        </button>
        <button onClick={onLater} disabled={busy} className="text-sm font-semibold text-muted hover:text-text">{t("draft.later")}</button>
      </div>
    </div>
  );
}

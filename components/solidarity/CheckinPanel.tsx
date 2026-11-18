"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CloudOff, Footprints, House, LifeBuoy, ShieldCheck, Vote, type LucideIcon } from "lucide-react";
import { t, type MessageKey } from "@/lib/i18n";
import { useOnline } from "@/lib/offline/hooks";
import { enqueueCheckin, syncCheckins } from "@/lib/solidarity/queue";
import { CHECKIN_STATUSES, type CheckinStatus } from "@/lib/solidarity/types";

const ICONS: Record<CheckinStatus, LucideIcon> = {
  on_my_way: Footprints,
  voted: Vote,
  home_safe: House,
  need_help: LifeBuoy,
};

type Result = { status: CheckinStatus; sent: boolean } | null;

/** Four big buttons. One tap sends (or queues offline). Never asks who anyone voted for. */
export function CheckinPanel({ unitId }: { unitId: string }) {
  const online = useOnline();
  const [busy, setBusy] = useState<CheckinStatus | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pending, setPending] = useState(0);

  const flush = useCallback(async () => {
    const o = await syncCheckins();
    setPending(o.pending);
    if (o.rateLimited) setRateLimited(true);
    return o;
  }, []);

  // Send anything saved earlier, now and whenever the phone comes back online.
  useEffect(() => {
    let live = true;
    void syncCheckins().then((o) => {
      if (!live) return;
      setPending(o.pending);
      if (o.rateLimited) setRateLimited(true);
    });
    return () => {
      live = false;
    };
  }, [online]);

  async function tap(status: CheckinStatus) {
    setBusy(status);
    setRateLimited(false);
    await enqueueCheckin(unitId, status);
    const o = await flush();
    setResult({ status, sent: o.pending === 0 });
    setBusy(null);
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 text-center animate-rise" role="status">
        <span className={`grid size-20 place-items-center rounded-full ${result.sent ? "bg-ok-bg text-ok-text" : "bg-surface-2 text-muted"}`}>
          {result.sent ? <Check aria-hidden className="size-10" /> : <CloudOff aria-hidden className="size-10" />}
        </span>
        <p className="text-lg font-semibold">{result.sent ? t("sol.checkin.sent") : t("sol.checkin.queued")}</p>
        {rateLimited && <p className="text-sm text-review-text">{t("sol.checkin.rate")}</p>}
        <button onClick={() => setResult(null)} className="btn btn-secondary min-h-12">{t("sol.checkin.again")}</button>
        <Privacy />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {CHECKIN_STATUSES.map((s) => {
          const Icon = ICONS[s];
          const help = s === "need_help";
          return (
            <button
              key={s}
              onClick={() => void tap(s)}
              disabled={busy !== null}
              className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-[1.25rem] p-4 text-center text-base font-semibold transition active:scale-[0.97] disabled:opacity-60 ${
                help ? "col-span-2 bg-review-bg text-review-text" : "card"
              }`}
            >
              <Icon aria-hidden className="size-10" />
              {t(`sol.checkin.${s}` as MessageKey)}
              {help && <span className="text-xs font-normal">{t("sol.checkin.need_help.hint")}</span>}
            </button>
          );
        })}
      </div>
      {(!online || pending > 0) && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          <CloudOff aria-hidden className="size-4" /> {pending > 0 ? t("sol.checkin.queued") : t("sol.checkin.failed")}
        </p>
      )}
      <Privacy />
    </div>
  );
}

function Privacy() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted">
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" /> {t("sol.privacy")}
    </p>
  );
}

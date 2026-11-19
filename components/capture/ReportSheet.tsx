"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaptureForm } from "@/components/capture/CaptureForm";
import { ElectionTabs } from "@/components/ElectionTabs";
import { parseElection } from "@/lib/elections";
import { t } from "@/lib/i18n";

/**
 * "Report a result sheet" with one tab per election. Each election posts its own sheet at
 * the unit, so the tab decides which result the photo counts towards. Tabs lock while a
 * photo is being read.
 */
export function ReportSheet({ heading = true }: { heading?: boolean }) {
  const params = useSearchParams();
  const [election, setElection] = useState(() => parseElection(params.get("election")));
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {heading && (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{t("capture.form.title")}</h2>
          <p className="text-sm text-muted">{t(`capture.form.hint.${election}`)}</p>
        </div>
      )}
      <ElectionTabs value={election} onChange={setElection} disabled={busy} />
      {!heading && <p className="-mt-2 text-sm text-muted">{t(`capture.form.hint.${election}`)}</p>}
      <CaptureForm election={election} onBusyChange={setBusy} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { errorMessage, responseError, UserError } from "@/lib/http";
import { ensureSession } from "@/lib/supabase/browser";

/** Asks the reader to read a photo again (only works from the phone that took it). */
export function ReadAgainButton({ photoId, onDone }: { photoId: string; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoId, reread: true }),
      });
      if (!res.ok) throw new UserError(await responseError(res, "error.reading"));
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "error.reading"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={run} disabled={busy} className="btn btn-secondary min-h-11 text-sm">
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
        {busy ? t("readAgain.busy") : t("readAgain.label")}
      </button>
      {error && <p role="alert" className="text-center text-xs text-review-text">{error}</p>}
    </div>
  );
}

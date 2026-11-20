"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { t } from "@/lib/i18n";
import { useOnline } from "@/lib/offline/hooks";

/** Any page that fails to render: say what happened in the reader's language, and offer a way on. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const online = useOnline();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState
        icon={online ? TriangleAlert : CloudOff}
        title={online ? t("error.page.title") : t("error.offline")}
        body={t("error.page.body")}
      >
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={retry} className="btn btn-primary">
            <RefreshCw aria-hidden className="size-4" /> {t("error.retry")}
          </button>
          <Link href="/" className="btn btn-secondary">{t("error.page.home")}</Link>
        </div>
      </EmptyState>
    </div>
  );
}

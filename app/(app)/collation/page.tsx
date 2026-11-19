import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { t } from "@/lib/i18n";
import { CollationForm } from "./CollationForm";

/** Anyone can enter an official figure (no login); it is only ever compared, never trusted on its own. */
export default function CollationPage() {
  return (
    <>
      <PageHeader title={t("collation.title")} subtitle={t("collation.hint")} />
      <div className="w-full max-w-2xl">
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <CollationForm />
        </Suspense>
      </div>
    </>
  );
}

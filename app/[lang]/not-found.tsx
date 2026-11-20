import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { t } from "@/lib/i18n";

/** A page or polling unit that doesn't exist, in the reader's language. */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <EmptyState icon={MapPinOff} title={t("notFound.title")} body={t("notFound.body")}>
        <Link href="/" className="btn btn-primary mt-2">{t("error.page.home")}</Link>
      </EmptyState>
    </div>
  );
}

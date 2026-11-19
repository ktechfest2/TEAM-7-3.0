import { Suspense } from "react";
import Link from "next/link";
import { HeaderNav } from "@/components/HeaderNav";
import { LogoMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

/** Dark top bar (matches the footer): brand and links (wide screens). No accounts: nobody signs in. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 bg-frame-2 text-frame-ink">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:h-18 md:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
          <LogoMark className="size-8" />
          {t("app.name")}
        </Link>
        <span className="mr-auto" />
        <Suspense>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}

import Link from "next/link";
import { DoodlePattern } from "@/components/home/Sticker";
import { LogoMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

/** Quiet sign-off on the header's dark band and grid. Extra bottom padding on phones clears the tab bar. */
export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-frame text-frame-muted">
      <DoodlePattern id="footer-doodles" scale={0.45} className="text-frame-ink opacity-[0.07]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-10 pb-28 md:flex-row md:items-center md:justify-between md:px-8 md:py-8">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight text-frame-ink">
          <LogoMark className="size-8" /> {t("app.name")}
        </Link>
        <p className="text-sm">{t("home.principle")}</p>
      </div>
    </footer>
  );
}

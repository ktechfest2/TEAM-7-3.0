"use client";

import { t } from "@/lib/i18n";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/i18n/langs";
import "./globals.css";

/** The language menu's cookie: the app's layout (which normally says the language) failed to render. */
function cookieLang(): Lang {
  if (typeof document === "undefined") return "en";
  const saved = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`))?.[1];
  return isLang(saved) ? saved : "en";
}

/** Last resort, when the app's own layout fails: a plain page that still explains and offers a retry. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const lang = cookieLang();
  return (
    <html lang={lang}>
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-text">
        <title>CounTrack</title>
        <h1 className="text-2xl font-bold">{t("error.page.title", undefined, lang)}</h1>
        <p className="max-w-sm text-muted">{t("error.page.body", undefined, lang)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={retry} className="btn btn-primary">{t("error.retry", undefined, lang)}</button>
          {/* A full load, not a client navigation: the layout itself is what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate full reload */}
          <a href="/" className="btn btn-secondary">{t("error.page.home", undefined, lang)}</a>
        </div>
      </body>
    </html>
  );
}

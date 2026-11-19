"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

const MIN_MS = 900;

/**
 * Brand splash on the first full page load: the logo with a sheet being "scanned", then a
 * fade out. Rendered by the server, so it covers the page from the first paint. A pure CSS
 * fallback hides it after a few seconds even if JavaScript never runs.
 */
export function Preloader() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");

  useEffect(() => {
    const started = performance.now();
    let timer = 0;
    const done = () => {
      const wait = Math.max(0, MIN_MS - (performance.now() - started));
      timer = window.setTimeout(() => {
        setPhase("hide");
        timer = window.setTimeout(() => setPhase("gone"), 450);
      }, wait);
    };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
      window.clearTimeout(timer);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className={`preloader fixed inset-0 z-[200] grid place-items-center bg-frame-2 text-frame-ink transition-opacity duration-400 ${phase === "hide" ? "pointer-events-none opacity-0" : ""}`}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative overflow-hidden rounded-[1.6rem]">
          <LogoMark className="size-24 animate-pop-in md:size-28" />
          <span aria-hidden className="scan-line absolute inset-x-0 h-10" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-3xl font-extrabold tracking-tight">{t("app.name")}</span>
          <span aria-hidden className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 140}ms` }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

const EXIT_MS = 220;

/**
 * Dialog that pops in (scale + rise) and pops out before unmounting. A bottom sheet on
 * phones, centred card on wider screens. `onClose` runs after the exit animation.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: (close: () => void) => React.ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // A timer (not animationend) so it still closes when reduced motion turns animations off.
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center md:items-center md:p-6">
      <div aria-hidden onClick={close} className={`absolute inset-0 bg-frame/70 backdrop-blur-sm ${leaving ? "animate-fade-out" : "animate-fade-in"}`} />
      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[1.75rem] bg-bg text-text shadow-lift outline-none md:rounded-[1.75rem] ${
          leaving ? "animate-pop-out" : "animate-pop-in"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
          <button onClick={close} aria-label={t("modal.close")} className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-text">
            <X aria-hidden className="size-4.5" />
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children(close)}</div>
      </div>
    </div>,
    document.body,
  );
}

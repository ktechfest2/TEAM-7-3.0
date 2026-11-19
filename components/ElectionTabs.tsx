"use client";

import Link from "next/link";
import { ELECTIONS, type Election } from "@/lib/elections";
import { t } from "@/lib/i18n";

type Props = {
  value: Election;
  /** Button tabs (client state)… */
  onChange?: (e: Election) => void;
  /** …or link tabs (query string), for server-rendered pages. Plain data, so servers can pass it. */
  links?: Record<Election, string>;
  disabled?: boolean;
  className?: string;
};

/** Presidential · Governorship · Senatorial · Local government. Scrolls sideways on narrow phones. */
export function ElectionTabs({ value, onChange, links, disabled, className = "" }: Props) {
  return (
    <div
      role="tablist"
      aria-label={t("election.label")}
      className={`-mx-1 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none] ${className}`}
    >
      {ELECTIONS.map((e) => {
        const active = e === value;
        const cls = `relative min-h-10 shrink-0 grow basis-0 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition ${
          active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text"
        } ${disabled && !active ? "pointer-events-none opacity-50" : ""}`;
        const label = t(`election.${e}`);
        return links ? (
          <Link key={e} role="tab" aria-selected={active} href={links[e]} scroll={false} className={`${cls} grid place-items-center`}>
            {label}
          </Link>
        ) : (
          <button key={e} type="button" role="tab" aria-selected={active} disabled={disabled && !active} onClick={() => onChange?.(e)} className={cls}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import { flagMessage } from "@/lib/rules/messages";
import type { CheckFlag } from "@/lib/schemas";

/** Rule-check results in plain language. Never accusatory: these are prompts to look closer. */
export function FlagList({ flags }: { flags: CheckFlag[] }) {
  if (!flags.length)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-ok-bg px-3 py-2.5 text-sm font-medium text-ok-text">
        <CircleCheck aria-hidden className="size-4 shrink-0" /> {t("flag.allPass")}
      </p>
    );
  // Things that stop the reading counting come first.
  const ordered = [...flags].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1));
  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((f, i) => {
        const blocking = f.severity === "blocking";
        const Icon = blocking ? CircleHelp : TriangleAlert;
        return (
          <li key={i} className="flex items-start gap-2.5 rounded-xl bg-review-bg px-3 py-2.5 text-sm text-review-text">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold tracking-wide uppercase opacity-80">{t(blocking ? "flag.blocking" : "flag.warning")}</span>
              <span>{flagMessage(f)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

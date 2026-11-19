import { CircleAlert, FileText, MapPin, NotebookPen } from "lucide-react";
import { FiguresTable } from "@/components/FiguresTable";
import { t, type MessageKey } from "@/lib/i18n";
import { ExtractedResult, VisionExtraction } from "@/lib/schemas";
import { fromVision, toPartyCode } from "@/lib/vision/map";

type Figure = VisionExtraction["registered_voters"];

/**
 * Everything read from one sheet, not just the numbers: the unit header, every figure in
 * digits AND words, each with its own confidence, then the reader's notes. Falls back to
 * the plain figures table for readings saved before the full-sheet format.
 */
/** The polling unit the witness picked in the form (State → LGA → Ward → Polling unit). */
export type ChosenUnit = { state?: string | null; lga?: string | null; ward?: string | null; name: string; code: string };

export function SheetReading({ raw, fallback, unit }: { raw: unknown; fallback?: unknown; unit?: ChosenUnit }) {
  const parsed = VisionExtraction.safeParse(raw);
  if (!parsed.success) {
    const old = ExtractedResult.safeParse(fallback);
    return old.success ? <FiguresTable result={old.data} /> : null;
  }
  const v = parsed.data;
  const { meta } = fromVision(v);
  const conflicts = new Set(meta.conflicts);

  const unitRows: [MessageKey, string | null][] = [
    // From the form the witness filled in; what's written on the sheet only fills a gap.
    ["sheet.state", unit?.state ?? v.unit.state],
    ["sheet.lga", unit?.lga ?? v.unit.lga],
    ["sheet.ward", unit?.ward ?? v.unit.ward],
    ["sheet.puName", unit?.name ?? v.unit.polling_unit_name],
    ["sheet.puCode", unit?.code ?? v.unit.polling_unit_code],
  ];
  const counts: [MessageKey, string, Figure][] = [
    ["fig.registered", "registered", v.registered_voters],
    ["fig.accredited", "accredited", v.accredited_voters],
  ];
  const totals: [MessageKey, string, Figure][] = [
    ["fig.rejected", "rejected", v.rejected_ballots],
    ["fig.total_valid", "total_valid", v.total_valid_votes],
    ["fig.votes_cast", "votes_cast", v.total_votes_cast],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1">
          <FileText aria-hidden className="size-3.5" /> {v.form_type === "EC8A" ? "Form EC8A" : t("sheet.otherForm")}
        </span>
        <Confidence value={v.confidence} label={t("sheet.overall")} />
        {!v.legible && <span className="rounded-full bg-review-bg px-2.5 py-1 text-review-text">{t("sheet.illegible")}</span>}
      </div>

      <Section title={t("sheet.unit")} icon={MapPin}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {unitRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted">{t(label)}</dt>
              <dd className={`truncate ${value ? "font-medium" : "text-sm text-muted italic"}`} title={value ?? undefined}>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={t("sheet.counts")}>
        {counts.map(([label, key, f]) => <FigureRow key={key} label={t(label)} f={f} conflict={conflicts.has(key)} />)}
      </Section>

      <Section title={t("sheet.parties", { n: v.party_scores.length })}>
        {v.party_scores.length === 0 && <p className="py-2 text-sm text-muted">{t("sheet.noParties")}</p>}
        {v.party_scores.map((p, i) => (
          <FigureRow key={`${p.party}-${i}`} label={p.party} strong f={p} conflict={conflicts.has(toPartyCode(p.party) ?? "")} />
        ))}
      </Section>

      <Section title={t("sheet.totals")}>
        {totals.map(([label, key, f]) => <FigureRow key={key} label={t(label)} f={f} conflict={conflicts.has(key)} />)}
      </Section>

      {v.notes && (
        <p className="flex gap-2 rounded-xl bg-sim-bg px-3.5 py-3 text-sm text-sim-text">
          <NotebookPen aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span><span className="font-semibold">{t("sheet.notes")}: </span>{v.notes}</span>
        </p>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-3">
      <h3 className="eyebrow mb-1.5 flex items-center gap-1.5">{Icon && <Icon aria-hidden className="size-3.5" />}{title}</h3>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

function FigureRow({ label, f, conflict, strong }: { label: string; f: Figure; conflict: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm ${strong ? "font-bold" : "text-muted"}`}>{label}</span>
        {f.words && <span className="truncate text-xs text-muted italic" title={f.words}>“{f.words}”</span>}
        {conflict && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-review-text">
            <CircleAlert aria-hidden className="size-3.5" /> {t("sheet.conflict")}
          </span>
        )}
      </div>
      <Confidence value={f.confidence} />
      <span className={`min-w-14 text-right font-mono tabular-nums ${f.figures === null ? "text-xs text-muted" : "text-lg font-bold"}`}>
        {f.figures ?? t("sheet.unreadable")}
      </span>
    </div>
  );
}

function Confidence({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  const cls = value >= 0.85 ? "bg-ok-bg text-ok-text" : value >= 0.6 ? "bg-review-bg text-review-text" : "bg-review-text text-review-bg";
  return (
    <span title={t("sheet.confidence")} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${cls}`}>
      {label ? `${label} ` : ""}{pct}%
    </span>
  );
}

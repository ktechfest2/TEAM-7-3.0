"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, FileCheck2, ImageUp, Loader2, Plus, Send, TriangleAlert } from "lucide-react";
import { UnitPickerFields, useUnitPicker } from "@/components/capture/UnitPicker";
import { ElectionTabs } from "@/components/ElectionTabs";
import { normalizePuCode } from "@/lib/directory";
import { DEFAULT_ELECTION, type Election } from "@/lib/elections";
import { t, type MessageKey } from "@/lib/i18n";
import { fileToJpeg } from "@/lib/image";
import { useOnline } from "@/lib/offline/hooks";
import { REGISTERED_PARTIES } from "@/lib/parties";
import type { UnitStatus } from "@/lib/schemas";
import { ensureSession } from "@/lib/supabase/browser";

/** Where the official figure came from. Shown next to every comparison. */
const SOURCES: { value: string; label: MessageKey }[] = [
  { value: "INEC IReV", label: "collation.source.irev" },
  { value: "Collation centre announcement", label: "collation.source.announcement" },
  { value: "EC8B collation sheet", label: "collation.source.ec8b" },
  { value: "Other", label: "collation.source.other" },
];

type Wall = { status: UnitStatus; scores: Record<string, number> | null };

/**
 * Enter the official (announced / IReV) figure for one polling unit, typed or read from a
 * picture, and compare it with what the witnesses verified on the wall.
 */
export function CollationForm() {
  const router = useRouter();
  const online = useOnline();
  const picker = useUnitPicker(online);
  const { unitId, unitCode } = picker.selection;
  const [election, setElection] = useState<Election>(DEFAULT_ELECTION);
  const [wall, setWall] = useState<{ key: string; value: Wall } | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [newParty, setNewParty] = useState("");
  const [source, setSource] = useState(SOURCES[0].value);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The verified wall result for this unit and election, to show beside each box.
  const wallKey = unitCode ? `${unitCode}/${election}` : "";
  useEffect(() => {
    if (!wallKey || !unitCode) return;
    let active = true;
    void fetch(`/api/compare?code=${encodeURIComponent(unitCode)}&election=${election}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { status: UnitStatus; wall: Record<string, number> | null } | null) => {
        if (active) setWall({ key: wallKey, value: { status: b?.status ?? "pending", scores: b?.wall ?? null } });
      })
      .catch(() => active && setWall({ key: wallKey, value: { status: "pending", scores: null } }));
    return () => { active = false; };
  }, [wallKey, unitCode, election]);
  const current = wall?.key === wallKey ? wall.value : null;

  const base = current?.scores ? Object.keys(current.scores).sort() : [...REGISTERED_PARTIES];
  const parties = [...new Set([...base, ...extra])];
  const total = parties.reduce((s, p) => s + Number(scores[p] || 0), 0);
  const newCode = newParty.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  function reset() {
    setScores({});
    setExtra([]);
    setReadNote(null);
    setError(null);
  }

  function addParty() {
    if (newCode && !parties.includes(newCode)) setExtra((x) => [...x, newCode]);
    setNewParty("");
  }

  /** Reads the figures from a screenshot / photo of the official result and fills the boxes. */
  async function readPicture(file: File) {
    setReading(true);
    setError(null);
    setReadNote(null);
    try {
      if (!(await ensureSession())) throw new Error(t("collation.failed"));
      const photo = await fileToJpeg(file);
      const res = await fetch("/api/collation/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: photo.dataUrl, election }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; partyScores?: Record<string, number>; unitCode?: string | null; notes?: string };
      if (!res.ok || !body.partyScores) throw new Error(body.error ?? t("collation.readFailed"));
      const read = body.partyScores;
      setExtra((x) => [...new Set([...x, ...Object.keys(read).filter((p) => !base.includes(p))])]);
      setScores(Object.fromEntries(Object.entries(read).map(([p, v]) => [p, String(v)])));
      const onPicture = body.unitCode ? normalizePuCode(body.unitCode) : null;
      const chosen = unitCode ? normalizePuCode(unitCode) ?? unitCode : null;
      setReadNote(
        onPicture && chosen && onPicture !== chosen
          ? t("collation.readOtherUnit", { code: onPicture })
          : t("collation.readDone", { n: Object.keys(read).length }),
      );
    } catch (e) {
      setError(e instanceof Error && !/fetch|load failed/i.test(e.message) ? e.message : t("collation.readFailed"));
    } finally {
      setReading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitId) return;
    setBusy(true);
    setError(null);
    // Only parties with a figure entered.
    const partyScores = Object.fromEntries(parties.filter((p) => scores[p]).map((p) => [p, Number(scores[p])]));
    if (!Object.keys(partyScores).length) {
      setBusy(false);
      return setError(t("collation.empty"));
    }
    if (!(await ensureSession())) {
      setBusy(false);
      return setError(t("collation.failed"));
    }
    const res = await fetch("/api/collation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "ward",
        election,
        areaCode: unitCode ?? unitId, // the server replaces this with the unit's ward for ward-level lines
        unitId,
        partyScores,
        source,
        announcedAt: new Date().toISOString(),
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; unitCode?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? t("collation.failed"));
    router.push(`/units/${encodeURIComponent(body?.unitCode ?? unitCode ?? "")}?election=${election}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 animate-rise">
      <ElectionTabs value={election} onChange={(v) => { setElection(v); reset(); }} />
      <UnitPickerFields picker={picker} showArea={false} />

      {unitId && (
        <fieldset className="card flex flex-col gap-4 p-4 animate-rise">
          <legend className="sr-only">{t("collation.announcedVotes")}</legend>

          <label className={`btn btn-secondary min-h-13 cursor-pointer ${reading ? "pointer-events-none opacity-60" : ""}`}>
            {reading ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ImageUp aria-hidden className="size-5" />}
            {reading ? t("collation.reading") : t("collation.fromPicture")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readPicture(file);
              }}
            />
          </label>
          <p className="-mt-2 text-xs text-muted">{t("collation.fromPictureHint")}</p>
          {readNote && (
            <p role="status" className="flex gap-2 rounded-xl bg-sim-bg px-3 py-2.5 text-sm text-sim-text">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {readNote}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-semibold">{t("collation.announcedVotes")}</span>
            <span className="font-mono text-sm text-muted tabular-nums">Σ {total}</span>
          </div>
          {current && !current.scores && <p className="-mt-2 text-xs text-muted">{t("collation.noWallYet")}</p>}
          <div className="grid grid-cols-2 gap-3">
            {parties.map((p) => {
              const wallVotes = current?.scores?.[p];
              const typed = scores[p];
              const differs = wallVotes !== undefined && typed !== undefined && typed !== "" && Number(typed) !== wallVotes;
              return (
                <label key={p} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2 text-xs font-semibold text-muted">
                    {p}
                    {wallVotes !== undefined && (
                      <span className={`font-mono font-medium ${differs ? "text-review-text" : ""}`}>{t("collation.wallValue", { n: wallVotes })}</span>
                    )}
                  </span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="—"
                    value={typed ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [p]: e.target.value.replace(/\D/g, "") }))}
                    className={`field text-center font-mono text-xl font-semibold tabular-nums ${differs ? "border-review-text" : ""}`}
                  />
                </label>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-border pt-4">
            <input
              value={newParty}
              onChange={(e) => setNewParty(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParty(); } }}
              placeholder={t("collation.addParty")}
              aria-label={t("collation.addParty")}
              className="field min-h-11 flex-1 uppercase"
            />
            <button type="button" onClick={addParty} disabled={!newCode} className="btn btn-secondary min-h-11 px-4">
              <Plus aria-hidden className="size-4" /> {t("collation.add")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("collation.partiesHint")}</p>
        </fieldset>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t("collation.source")}</span>
        <span className="relative block">
          <FileCheck2 aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="field appearance-none pr-10 pl-12 font-medium">
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
          </select>
          <ChevronsUpDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" />
        </span>
      </label>

      {error && <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{error}</p>}

      <button disabled={!unitId || busy || reading} className="btn btn-primary min-h-14 text-base">
        <Send aria-hidden className="size-5" /> {busy ? t("common.saving") : t("collation.submit")}
      </button>
    </form>
  );
}

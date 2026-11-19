"use client";

import { useEffect, useState } from "react";
import { ChevronsUpDown, CircleCheck, CloudOff, Hash, Loader2 } from "lucide-react";
import { normalizePuCode } from "@/lib/directory";
import { t } from "@/lib/i18n";
import { useDirectoryTree, useOfflineArea, useWardUnits, type AreaStatus } from "@/lib/offline/directory";
import { cacheUnits, cachedUnitByCode, type CachedUnit } from "@/lib/offline/queue";
import { browserClient } from "@/lib/supabase/browser";

const sorted = (xs: Iterable<string>) => [...xs].sort((a, b) => a.localeCompare(b));

export type UnitSelection = { unitId: string; unitCode: string | undefined; unitName: string | undefined; ready: boolean };
export type UnitPicker = ReturnType<typeof useUnitPicker>;

/**
 * State → LGA → Ward → Polling unit. Lists come from the phone first (so they work offline
 * once saved) and the server when online. In a ward with no listed units the witness can
 * type the polling unit code printed on the sheet instead.
 */
export function useUnitPicker(online: boolean, initialCode?: string | null) {
  const { tree, loaded, isReal } = useDirectoryTree(online);
  const [pick, setPick] = useState({ state: "", lga: "", ward: "", unit: "" });
  const [typedCode, setTypedCode] = useState("");

  // ?unit=CODE preselects that unit: from the phone first, then the server.
  useEffect(() => {
    if (!initialCode) return;
    let active = true;
    const apply = (u: CachedUnit | undefined) => {
      if (active && u?.state && u.lga) setPick((p) => (p.unit ? p : { state: u.state!, lga: u.lga!, ward: u.ward, unit: u.id }));
      return !!u;
    };
    void (async () => {
      if (apply(await cachedUnitByCode(initialCode)) || !online) return;
      const { data } = await browserClient().from("polling_units").select("id, code, name, location, ward, lga, state").eq("code", initialCode).maybeSingle();
      if (data) await cacheUnits([data as CachedUnit], false);
      apply((data as CachedUnit | null) ?? undefined);
    })();
    return () => { active = false; };
  }, [initialCode, online]);

  // Each level's options come from the level above. A level with only one option fills itself in.
  const states = sorted(Object.keys(tree));
  const state = pick.state || (states.length === 1 ? states[0] : "");
  const lgas = sorted(Object.keys(tree[state] ?? {}));
  const lga = pick.lga || (lgas.length === 1 ? lgas[0] : "");
  const wards = sorted(tree[state]?.[lga] ?? []);
  const ward = pick.ward || (wards.length === 1 ? wards[0] : "");
  const real = isReal(state);
  const area = useOfflineArea(state, online, real);
  const { units, loading } = useWardUnits(state, lga, ward, online, real);
  const unitId = pick.unit && units.some((u) => u.id === pick.unit) ? pick.unit : units.length === 1 ? units[0].id : "";

  const needCode = !!ward && !loading && units.length === 0;
  const typed = needCode ? normalizePuCode(typedCode) : null;
  const unit = units.find((u) => u.id === unitId);

  const selection: UnitSelection = {
    unitId,
    unitCode: unit?.code ?? typed ?? undefined,
    unitName: unit?.name ?? typed ?? undefined,
    ready: !!unitId || !!typed,
  };

  return {
    online, loaded, states, state, lgas, lga, wards, ward, units, unitId, loading, needCode, typedCode, typed, area, selection,
    chooseState: (v: string) => setPick({ state: v, lga: "", ward: "", unit: "" }),
    chooseLga: (v: string) => setPick((p) => ({ ...p, state, lga: v, ward: "", unit: "" })),
    chooseWard: (v: string) => setPick((p) => ({ ...p, state, lga, ward: v, unit: "" })),
    chooseUnit: (v: string) => setPick((p) => ({ ...p, state, lga, ward, unit: v })),
    setTypedCode,
  };
}

export function UnitPickerFields({ picker: p, locked = false, showArea = true }: { picker: UnitPicker; locked?: boolean; showArea?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Select label={t("capture.state")} value={p.state} options={p.states.map((s) => [s, s])} disabled={locked || !p.loaded} onChange={p.chooseState} />
        <Select label={t("capture.lga")} value={p.lga} options={p.lgas.map((s) => [s, s])} disabled={locked || !p.state} onChange={p.chooseLga} />
        <Select label={t("capture.ward")} value={p.ward} options={p.wards.map((s) => [s, s])} disabled={locked || !p.lga} onChange={p.chooseWard} />
        {p.needCode ? (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">{t("capture.unitCode")}</span>
            <span className="relative block">
              <Hash aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                value={p.typedCode}
                onChange={(e) => p.setTypedCode(e.target.value)}
                disabled={locked}
                inputMode="numeric"
                placeholder="24/05/03/012"
                aria-invalid={!!p.typedCode && !p.typed}
                className="field min-h-12 pl-9 font-mono text-sm"
              />
            </span>
          </label>
        ) : (
          <Select
            label={t("capture.unit")}
            value={p.unitId}
            options={p.units.map((u) => [u.id, `${u.code} · ${u.name}${u.location ? ` — ${u.location}` : ""}`])}
            disabled={locked || !p.ward || p.loading}
            onChange={p.chooseUnit}
          />
        )}
      </div>

      {p.loaded && p.states.length === 0 && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" /> {p.online ? t("common.loading") : t("capture.directoryNone")}
        </p>
      )}
      {p.needCode && (
        <p role="status" className="-mt-1 text-xs text-muted">
          {p.online ? t("capture.unitCode.none") : t("capture.unitCode.offline")}{" "}
          {p.typedCode && !p.typed && <span className="font-medium text-review-text">{t("capture.unitCode.invalid")}</span>}
        </p>
      )}
      {showArea && p.area && <AreaLine area={p.area} />}
    </>
  );
}

function Select({
  label, value, options, disabled, onChange,
}: { label: string; value: string; options: [string, string][]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="relative block">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="field min-h-12 appearance-none truncate pr-9 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-55"
        >
          <option value="">{t("capture.choose")}</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <ChevronsUpDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** Whether the chosen state works offline on this phone. */
function AreaLine({ area }: { area: AreaStatus }) {
  if (area.status === "saving")
    return (
      <p role="status" className="-mt-1 flex items-center gap-2 text-xs text-muted">
        <Loader2 aria-hidden className="size-3.5 animate-spin" /> {t("capture.area.saving", { state: area.state })}
      </p>
    );
  if (area.status === "saved")
    return (
      <p role="status" className="-mt-1 flex items-center gap-2 text-xs text-ok-text">
        <CircleCheck aria-hidden className="size-3.5" /> {t("capture.area.saved", { state: area.state, n: area.count.toLocaleString("en-NG") })}
      </p>
    );
  return (
    <p role="status" className="-mt-1 flex items-center gap-2 text-xs text-muted">
      <CloudOff aria-hidden className="size-3.5" /> {t(area.status === "missing" ? "capture.area.missing" : "capture.area.failed", { state: area.state })}
    </p>
  );
}

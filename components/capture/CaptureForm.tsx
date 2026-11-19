"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Camera, ChevronsUpDown, Loader2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { CameraSheet } from "@/components/capture/CameraSheet";
import { CaptureStatus } from "@/components/CaptureStatus";
import { HashChip } from "@/components/HashChip";
import { formatTime } from "@/lib/format";
import { sha256Hex } from "@/lib/hash";
import { t } from "@/lib/i18n";
import { compressImage } from "@/lib/image";
import { useCaptures, useOnline } from "@/lib/offline/hooks";
import { cacheUnits, cachedUnits, enqueue, type CachedUnit } from "@/lib/offline/queue";
import { syncAll } from "@/lib/offline/sync";
import type { QueuedCapture } from "@/lib/schemas";
import { browserClient } from "@/lib/supabase/browser";

/** A photo that has been taken and sealed, but not sent yet: the witness checks it first. */
type Draft = { blob: Blob; sha256: string; capturedAt: string; url: string };

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
type DirectoryOption = { code: string; name: string };
type DirectoryUnit = CachedUnit & { location?: string | null };

async function fetchDirectory<T>(params: Record<string, string>): Promise<T[]> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/polling-units?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Polling unit directory is unavailable");
  const body = (await response.json()) as { data?: T[] };
  return body.data ?? [];
}

function mergeUnits(...lists: CachedUnit[][]): CachedUnit[] {
  const byId = new Map<string, CachedUnit>();
  for (const list of lists) for (const unit of list) byId.set(unit.id, unit);
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * State → LGA → Ward → Polling unit, then photograph, check (retake or send).
 * The photo button stays inactive until all four fields are filled.
 */
export function CaptureForm() {
  const params = useSearchParams();
  const online = useOnline();
  const captures = useCaptures();
  const [units, setUnits] = useState<CachedUnit[]>([]);
  const [realStates, setRealStates] = useState<DirectoryOption[]>([]);
  const [lgaOptions, setLgaOptions] = useState<{ parent: string; items: DirectoryOption[] }>({ parent: "", items: [] });
  const [wardOptions, setWardOptions] = useState<{ parent: string; items: DirectoryOption[] }>({ parent: "", items: [] });
  const [unitOptions, setUnitOptions] = useState<{ parent: string; items: DirectoryUnit[] }>({ parent: "", items: [] });
  const [directoryError, setDirectoryError] = useState(false);
  const [pick, setPick] = useState({ state: "", lga: "", ward: "", unit: "" });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sent, setSent] = useState<{ id: string; url: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Keep demo and previously selected units available offline; load real directory options online.
  useEffect(() => {
    const wanted = params.get("unit");
    const apply = (list: CachedUnit[]) => {
      if (!list.length) return;
      setUnits((current) => mergeUnits(current, list));
      const u = wanted ? list.find((x) => x.code === wanted) : undefined;
      if (u) setPick((p) => (p.unit ? p : { state: u.state ?? "", lga: u.lga ?? "", ward: u.ward, unit: u.id }));
    };
    void cachedUnits().then(apply);
    if (online) {
      void fetchDirectory<DirectoryOption>({ level: "states" })
        .then(setRealStates)
        .catch(() => setDirectoryError(true));
      void browserClient()
        .from("polling_units")
        .select("id, code, name, ward, lga, state")
        .eq("is_simulated", true)
        .order("code")
        .then(({ data }) => {
          if (!data) return;
          const demoUnits = data as CachedUnit[];
          setUnits((current) => mergeUnits(current, demoUnits));
          void cacheUnits(demoUnits, false);
          const u = wanted ? demoUnits.find((x) => x.code === wanted) : undefined;
          if (u) setPick((p) => (p.unit ? p : { state: u.state ?? "", lga: u.lga ?? "", ward: u.ward, unit: u.id }));
        });
      if (wanted && !wanted.startsWith("SIM-")) {
        void fetchDirectory<DirectoryUnit>({ code: wanted })
          .then((found) => {
            const u = found[0];
            if (!u) return;
            setUnits((current) => mergeUnits(current, [u]));
            void cacheUnits([u], false);
            setPick((p) => (p.unit ? p : { state: u.state ?? "", lga: u.lga ?? "", ward: u.ward, unit: u.id }));
          })
          .catch(() => setDirectoryError(true));
      }
    }
    void browserClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, [params, online]);

  const states = useMemo(
    () => uniq([...realStates.map((s) => s.name), ...units.map((u) => u.state)]),
    [realStates, units],
  );
  const state = pick.state || (states.length === 1 ? states[0] : "");
  const isRealState = realStates.some((s) => s.name === state);
  const realLgas = lgaOptions.parent === state ? lgaOptions.items : [];

  useEffect(() => {
    if (!online || !isRealState || !state) return;
    let active = true;
    void fetchDirectory<DirectoryOption>({ level: "lgas", state })
      .then((options) => { if (active) setLgaOptions({ parent: state, items: options }); })
      .catch(() => { if (active) setDirectoryError(true); });
    return () => { active = false; };
  }, [online, isRealState, state]);

  const lgas = isRealState && online
    ? realLgas.map((option) => option.name)
    : uniq(units.filter((u) => u.state === state).map((u) => u.lga));
  const lga = pick.lga || (lgas.length === 1 ? lgas[0] : "");
  const realWards = wardOptions.parent === `${state}/${lga}` ? wardOptions.items : [];

  useEffect(() => {
    if (!online || !isRealState || !state || !lga) return;
    let active = true;
    void fetchDirectory<DirectoryOption>({ level: "wards", state, lga })
      .then((options) => { if (active) setWardOptions({ parent: `${state}/${lga}`, items: options }); })
      .catch(() => { if (active) setDirectoryError(true); });
    return () => { active = false; };
  }, [online, isRealState, state, lga]);

  const wards = isRealState && online
    ? realWards.map((option) => option.name)
    : uniq(units.filter((u) => u.state === state && u.lga === lga).map((u) => u.ward));
  const ward = pick.ward || (wards.length === 1 ? wards[0] : "");
  const realUnits = unitOptions.parent === `${state}/${lga}/${ward}` ? unitOptions.items : [];

  useEffect(() => {
    if (!online || !isRealState || !state || !lga || !ward) return;
    let active = true;
    void fetchDirectory<DirectoryUnit>({ level: "units", state, lga, ward })
      .then((options) => {
        if (!active) return;
        setUnitOptions({ parent: `${state}/${lga}/${ward}`, items: options });
        void cacheUnits(options, false);
        setUnits((current) => mergeUnits(current, options));
      })
      .catch(() => { if (active) setDirectoryError(true); });
    return () => { active = false; };
  }, [online, isRealState, state, lga, ward]);

  // Each level's options depend on the level above. A level with only one option fills itself in.
  const sel = useMemo(() => {
    const inWard = isRealState && online
      ? realUnits
      : units.filter((u) => u.state === state && u.lga === lga && u.ward === ward);
    const unit = pick.unit || (inWard.length === 1 ? inWard[0].id : "");
    return { states, state, lgas, lga, wards, ward, inWard, unit };
  }, [units, realUnits, isRealState, online, states, state, lgas, lga, wards, ward, pick.unit]);

  const unitId = sel.unit;
  const ready = !!unitId;

  // Preview URLs are freed when replaced and when leaving the page.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const previewUrl = (blob: Blob) => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    const u = URL.createObjectURL(blob);
    urls.current.add(u);
    return u;
  };

  const openCamera = () => setCameraOpen(true);

  /** Photo taken: compress and seal it straight away, then let the witness check it. */
  async function onPhoto(photo: Blob) {
    setCameraOpen(false);
    if (!unitId) return;
    const capturedAt = new Date().toISOString(); // device clock, at the moment of capture
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(photo);
      const sha256 = await sha256Hex(blob);
      setSent(null);
      setDraft({ blob, sha256, capturedAt, url: previewUrl(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Witness is happy with the photo: queue it and upload. */
  async function send() {
    if (!draft || !unitId) return;
    setBusy(true);
    setError(null);
    try {
      const localId = crypto.randomUUID();
      await enqueue({ localId, unitId, blob: draft.blob, sha256: draft.sha256, capturedAt: draft.capturedAt, status: "queued", attempts: 0 });
      setSent({ id: localId, url: draft.url });
      setDraft(null);
      void syncAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setDraft(null);
  }

  const current = sent ? captures?.find((c) => c.localId === sent.id) : undefined;
  const locked = !!draft || busy;
  const unitCode = units.find((u) => u.id === unitId)?.code;
  // Offline capture always works; a session is only needed to upload.
  const needsSignIn = signedIn === false && online;

  return (
    <div className="flex flex-col gap-4">
      {cameraOpen && (
        <CameraSheet
          title={units.find((u) => u.id === unitId)?.name}
          onCapture={onPhoto}
          onClose={() => setCameraOpen(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t("capture.state")}
          value={sel.state}
          options={sel.states.map((s) => [s, s])}
          disabled={locked}
          onChange={(v) => setPick({ state: v, lga: "", ward: "", unit: "" })}
        />
        <Select
          label={t("capture.lga")}
          value={sel.lga}
          options={sel.lgas.map((s) => [s, s])}
          disabled={locked || !sel.state || (online && isRealState && realLgas.length === 0)}
          onChange={(v) => setPick((p) => ({ ...p, lga: v, ward: "", unit: "" }))}
        />
        <Select
          label={t("capture.ward")}
          value={sel.ward}
          options={sel.wards.map((s) => [s, s])}
          disabled={locked || !sel.lga || (online && isRealState && realWards.length === 0)}
          onChange={(v) => setPick((p) => ({ ...p, ward: v, unit: "" }))}
        />
        <Select
          label={t("capture.unit")}
          value={sel.unit}
          options={sel.inWard.map((u) => [u.id, `${u.code} · ${u.name}${"location" in u && u.location ? ` — ${u.location}` : ""}`])}
          disabled={locked || !sel.ward || (online && isRealState && realUnits.length === 0)}
          onChange={(v) => setPick((p) => ({ ...p, unit: v }))}
        />
      </div>

      {directoryError && <p role="status" className="text-xs text-muted">{t("capture.directoryError")}</p>}

      {draft ? (
        <Review draft={draft} busy={busy} onRetake={openCamera} onCancel={cancel} onSend={send} />
      ) : (
        <>
          {needsSignIn && ready ? (
            <Link href={`/login?next=${encodeURIComponent(`/capture?unit=${unitCode ?? ""}`)}`} className="btn btn-primary min-h-15 w-full text-base">
              <Camera aria-hidden className="size-5" /> {t("capture.signInToSnap")}
            </Link>
          ) : (
            <button onClick={openCamera} disabled={!ready || busy} className="btn btn-primary min-h-15 w-full text-base">
              {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Camera aria-hidden className="size-5" />}
              {busy ? t("capture.hashing") : t("home.capture")}
            </button>
          )}
          {!ready && <p className="-mt-1 text-center text-xs text-muted">{t("capture.fillFirst")}</p>}
        </>
      )}

      {sent && !draft && <Sent preview={sent.url} item={current} online={online} />}

      {error && <p role="alert" className="rounded-2xl bg-review-bg p-4 text-sm text-review-text">{error}</p>}
    </div>
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

/** The check before sending: big preview, the seal, then Cancel / Retake / Send. */
function Review({ draft, busy, onRetake, onCancel, onSend }: { draft: Draft; busy: boolean; onRetake: () => void; onCancel: () => void; onSend: () => void }) {
  return (
    <section className="flex flex-col gap-3 animate-rise">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      <img src={draft.url} alt={t("capture.previewAlt")} className="max-h-[55vh] w-full rounded-[1.1rem] border border-border bg-surface-2 object-contain" />
      <p className="text-sm font-medium">{t("capture.check")}</p>
      <div className="flex items-center gap-2 text-ok-text">
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        <HashChip hash={draft.sha256} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRetake} disabled={busy} className="btn btn-secondary min-h-14 text-base">
          <RotateCcw aria-hidden className="size-5" /> {t("capture.retake")}
        </button>
        <button onClick={onSend} disabled={busy} className="btn btn-primary min-h-14 text-base">
          {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5" />}
          {busy ? t("capture.sending") : t("capture.send")}
        </button>
      </div>
      <button onClick={onCancel} disabled={busy} className="self-center text-sm font-medium text-muted hover:text-text">
        {t("capture.cancel")}
      </button>
    </section>
  );
}

/** After sending: the sealed photo and its live upload status. */
function Sent({ preview, item, online }: { preview: string; item: QueuedCapture | undefined; online: boolean }) {
  return (
    <section className="flex items-center gap-4 rounded-[1.25rem] bg-ok-bg p-3 text-ok-text animate-rise">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      <img src={preview} alt={t("capture.previewAlt")} className="size-16 shrink-0 rounded-xl object-cover" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck aria-hidden className="size-4" /> {t("capture.sealed")}
        </p>
        {item && <p className="text-xs opacity-80">{t("capture.capturedAt", { time: formatTime(item.capturedAt) })}</p>}
        {item && <CaptureStatus item={item} online={online} />}
      </div>
      {item?.status === "done" && item.photoId && (
        <Link href={`/review/${item.photoId}`} aria-label={t("capture.seeResult")} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
          <ArrowRight aria-hidden className="size-5" />
        </Link>
      )}
    </section>
  );
}

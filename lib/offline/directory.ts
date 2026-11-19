"use client";

import { useEffect, useMemo, useState } from "react";
import type { AreaResponse, DirectoryTree, TreeResponse } from "../directory";
import { browserClient } from "../supabase/browser";
import {
  cacheUnits, cachedUnits, cachedUnitsInWard, getAreaMeta, getTreeMeta, putMeta,
  type AreaMeta, type CachedUnit, type TreeMeta,
} from "./queue";

/**
 * The polling-unit directory, usable offline:
 *  - the State → LGA → Ward tree is downloaded once and kept on the phone (refreshed daily);
 *  - choosing a state while online saves every unit in that state, so any ward in it works offline;
 *  - simulated demo units are cached too.
 */
const TREE_MAX_AGE = 24 * 3600_000;
const AREA_MAX_AGE = 7 * 24 * 3600_000;

let treeRequest: Promise<TreeMeta | null> | null = null;
function refreshTree(): Promise<TreeMeta | null> {
  treeRequest ??= (async () => {
    const res = await fetch("/api/polling-units/tree");
    if (!res.ok) return null;
    const body = (await res.json()) as TreeResponse;
    const meta: TreeMeta = { key: "tree", snapshot: body.snapshot, savedAt: Date.now(), tree: body.tree };
    await putMeta(meta);
    return meta;
  })().catch(() => null).finally(() => { treeRequest = null; });
  return treeRequest;
}

const areaRequests = new Map<string, Promise<AreaMeta>>();
/** Downloads and stores every unit in a state. Safe to call repeatedly: one download per state at a time. */
export function saveStateOffline(state: string): Promise<AreaMeta> {
  let p = areaRequests.get(state);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/api/polling-units/area?state=${encodeURIComponent(state)}`);
      if (!res.ok) throw new Error(`Could not save ${state} (${res.status})`);
      const body = (await res.json()) as AreaResponse;
      await cacheUnits(body.units.map(([id, code, name, location, lga, ward]) => ({ id, code, name, location, lga, ward, state })), false);
      const meta: AreaMeta = { key: `area:${state}`, snapshot: body.snapshot, savedAt: Date.now(), count: body.units.length };
      await putMeta(meta);
      return meta;
    })().finally(() => areaRequests.delete(state));
    areaRequests.set(state, p);
  }
  return p;
}

/** Adds cached units (e.g. simulated demo units) to the tree so they can be picked offline too. */
function withUnits(tree: DirectoryTree, units: CachedUnit[]): DirectoryTree {
  const out: DirectoryTree = { ...tree };
  for (const u of units) {
    if (!u.state || !u.lga || tree[u.state]) continue; // real states already have every ward
    const wards = ((out[u.state] ??= {})[u.lga] ??= []);
    if (!wards.includes(u.ward)) wards.push(u.ward);
  }
  return out;
}

/** The tree from the phone, refreshed from the server when online and older than a day. */
export function useDirectoryTree(online: boolean) {
  const [real, setReal] = useState<TreeMeta | null>(null);
  const [extra, setExtra] = useState<CachedUnit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [meta, units] = await Promise.all([getTreeMeta(), cachedUnits()]);
      if (!active) return;
      if (meta) setReal(meta);
      setExtra(units.filter((u) => u.code.startsWith("SIM-")));
      setLoaded(true);
      if (!online) return;
      if (!meta || Date.now() - meta.savedAt > TREE_MAX_AGE) {
        const fresh = await refreshTree();
        if (active && fresh) setReal(fresh);
      }
      // Simulated demo units are not in the real directory: keep them cached as before.
      const { data } = await browserClient().from("polling_units").select("id, code, name, ward, lga, state").eq("is_simulated", true).order("code");
      if (active && data?.length) {
        await cacheUnits(data as CachedUnit[], false);
        setExtra(data as CachedUnit[]);
      }
    })();
    return () => { active = false; };
  }, [online]);

  const tree = useMemo(() => withUnits(real?.tree ?? {}, extra), [real, extra]);
  return { tree, hasRealTree: !!real, loaded, isReal: (state: string) => !!real?.tree[state] };
}

/** Units in one ward: instantly from the phone, then refreshed from the server when online. */
export function useWardUnits(state: string, lga: string, ward: string, online: boolean, isReal: boolean) {
  const key = state && lga && ward ? `${state}/${lga}/${ward}` : "";
  const [result, setResult] = useState<{ key: string; units: CachedUnit[]; fromServer: boolean }>({ key: "", units: [], fromServer: false });

  useEffect(() => {
    if (!key) return;
    let active = true;
    void (async () => {
      const local = await cachedUnitsInWard(state, lga, ward);
      if (active) setResult({ key, units: local, fromServer: false });
      if (!online || !isReal) return;
      const params = new URLSearchParams({ level: "units", state, lga, ward });
      const res = await fetch(`/api/polling-units?${params}`).catch(() => null);
      if (!active || !res?.ok) return;
      const body = (await res.json()) as { data?: CachedUnit[] };
      const units = (body.data ?? []).map(({ id, code, name, location, ward: w, lga: l, state: s }) => ({ id, code, name, location, ward: w, lga: l, state: s }));
      await cacheUnits(units, false);
      if (active) setResult({ key, units, fromServer: true });
    })();
    return () => { active = false; };
  }, [key, state, lga, ward, online, isReal]);

  const current = result.key === key;
  return { units: current ? result.units : [], loading: !!key && (!current || (online && isReal && !result.fromServer && result.units.length === 0)) };
}

export type AreaStatus = { state: string; status: "saving" | "saved" | "missing" | "failed"; count: number };

/** Whether the chosen state's units are saved for offline use; downloads them in the background when online. */
export function useOfflineArea(state: string, online: boolean, isReal: boolean): AreaStatus | null {
  const [status, setStatus] = useState<AreaStatus | null>(null);

  useEffect(() => {
    if (!state || !isReal) return;
    let active = true;
    void (async () => {
      const meta = await getAreaMeta(state);
      if (!active) return;
      const fresh = meta && Date.now() - meta.savedAt < AREA_MAX_AGE;
      if (meta) setStatus({ state, status: "saved", count: meta.count });
      if (fresh) return;
      if (!online) return setStatus(meta ? { state, status: "saved", count: meta.count } : { state, status: "missing", count: 0 });
      if (!meta) setStatus({ state, status: "saving", count: 0 });
      try {
        const saved = await saveStateOffline(state);
        if (active) setStatus({ state, status: "saved", count: saved.count });
      } catch {
        if (active && !meta) setStatus({ state, status: "failed", count: 0 });
      }
    })();
    return () => { active = false; };
  }, [state, online, isReal]);

  return status?.state === state ? status : null;
}

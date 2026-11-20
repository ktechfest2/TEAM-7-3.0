"use client";

import { useEffect, useState } from "react";
import { errorMessage, fetchJson } from "@/lib/http";

/** Successful lookups are kept for the session; IReV is slow and the hierarchy rarely changes. */
const cache = new Map<string, Promise<unknown>>();

async function load(url: string): Promise<unknown> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = fetchJson<unknown>(url, undefined, "api.irev.unavailable");
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

type State<T> = { url: string | null; body: T | null; error: string | null };

/** Fetches `url` (null = nothing to load) and reports the body only while it still matches `url`. */
export function useFetch<T>(url: string | null) {
  const [state, setState] = useState<State<T>>({ url: null, body: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url).then(
      (body) => live && setState({ url, body: body as T, error: null }),
      (e: unknown) => live && setState({ url, body: null, error: errorMessage(e, "api.irev.unavailable") }),
    );
    return () => { live = false; };
  }, [url, attempt]);
  const fresh = !!url && state.url === url;
  return {
    body: fresh ? state.body : null,
    error: fresh ? state.error : null,
    loading: !!url && (!fresh || (state.body === null && state.error === null)),
    retry: () => { if (url) cache.delete(url); setState({ url: null, body: null, error: null }); setAttempt((n) => n + 1); },
  };
}

/** /api/irev list levels: { data: T[] }. */
export function useIrevList<T>(url: string | null) {
  const r = useFetch<{ data: T[] }>(url);
  return { ...r, data: r.body?.data ?? null };
}

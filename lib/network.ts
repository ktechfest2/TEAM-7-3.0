/**
 * A dropped or flaky connection, as each browser reports it: Safari "Load failed", Chrome
 * "Failed to fetch", Firefox "NetworkError…", plus Supabase's wrapped versions of those.
 * navigator.onLine can still say true while this happens (Wi-Fi up, no internet).
 */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return /load failed|failed to fetch|networkerror|network request failed|fetch failed|internet connection appears to be offline|timed? ?out/i.test(msg);
}


/** Server says "couldn't reach a service, try again": the capture waits, it isn't a real failure. */
export const RETRYABLE_STATUS = 503;

/** Server says "this photo can't be used" (damaged in transit, or not an image): retake, don't retry. */
export const RETAKE_STATUS = 422;

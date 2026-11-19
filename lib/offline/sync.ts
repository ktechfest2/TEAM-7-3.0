import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "../hash";
import { t } from "../i18n";
import { DEFAULT_ELECTION } from "../elections";
import { browserClient, ensureSession } from "../supabase/browser";
import type { QueuedCapture } from "../schemas";
import { isNetworkError, RETAKE_STATUS, RETRYABLE_STATUS } from "../network";
import { getPhoto, listCaptures, updateCapture } from "./queue";

export { isNetworkError };

export const MAX_ATTEMPTS = 5;
let running: Promise<void> | null = null;

/** Thrown when the connection itself failed: the capture waits for the network, it isn't "broken". */
class OfflineError extends Error {}
/** A message written for the witness (shown as is). Anything else shows a generic friendly line. */
class UserFacingError extends Error {}
/** The photo is gone from the phone's storage: retrying can't help, the witness must retake it. */
class PhotoLostError extends UserFacingError {}

/** Captures still waiting to go up (not drafts, not done, not given up on). */
export const isPending = (c: QueuedCapture) =>
  c.status !== "done" && c.status !== "draft" && !!(c.unitId || c.unitCode) && c.attempts < MAX_ATTEMPTS;

/** Uploads every pending capture, oldest first. Safe to call often: runs one pass at a time. */
export function syncAll(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run() {
  if (!navigator.onLine) return;
  const pending = (await listCaptures()).filter(isPending).reverse();
  if (!pending.length) return;
  // No login: a silent anonymous session is created the first time this phone uploads.
  const userId = await ensureSession().catch(() => null);
  if (!userId) return; // no connection yet: everything stays queued for the next try
  const supabase = browserClient();
  for (const item of pending) {
    // Connection dropped: stop here and leave the rest queued; SyncManager tries again shortly.
    if (!(await syncOne(supabase, userId, item))) return;
  }
}

/** Returns false if the connection failed (stop this pass), true otherwise. */
async function syncOne(supabase: SupabaseClient, userId: string, item: QueuedCapture): Promise<boolean> {
  try {
    // Captured offline by typing the unit code: find the unit now that we are online.
    if (!item.unitId && item.unitCode) {
      const { data, error } = await supabase.from("polling_units").select("id").eq("code", item.unitCode).maybeSingle();
      if (error) throw error;
      if (!data) throw new UserFacingError(t("error.unitCode", { code: item.unitCode }));
      item = { ...item, unitId: data.id as string };
      await updateCapture(item.localId, { unitId: item.unitId });
    }
    let photoId = item.photoId;
    if (!photoId) {
      await updateCapture(item.localId, { status: "uploading", error: undefined });
      photoId = await upload(supabase, userId, item);
      await updateCapture(item.localId, { status: "uploaded", photoId });
    }
    await updateCapture(item.localId, { status: "extracting" });
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoId }),
    }).catch((e) => { throw new OfflineError(String(e)); });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      // The server couldn't reach the database or the reader: same as being offline, try again soon.
      if (res.status === RETRYABLE_STATUS || res.status === 401) throw new OfflineError(body?.error ?? "Service unavailable");
      // The server got a damaged or unreadable photo: retrying the same file can't help.
      if (res.status === RETAKE_STATUS) throw new PhotoLostError(body?.error ?? "Please take this photo again.");
      // Our API's error messages are written for people; anything else gets a friendly default.
      throw body?.error ? new UserFacingError(body.error) : new Error(`Reading failed (${res.status})`);
    }
    await updateCapture(item.localId, { status: "done", error: undefined });
    return true;
  } catch (e) {
    try {
      if (e instanceof PhotoLostError) {
        await updateCapture(item.localId, { status: "failed", attempts: MAX_ATTEMPTS, error: e.message });
        return true;
      }
      // No connection (or it dropped mid-way): back to the queue without using up an attempt.
      // The photo id is kept, so the next try only does the steps that are left.
      if (!navigator.onLine || e instanceof OfflineError || isNetworkError(e)) {
        await updateCapture(item.localId, { status: "queued", error: undefined });
        return false;
      }
      console.error("upload failed", e);
      await updateCapture(item.localId, {
        status: "failed",
        attempts: item.attempts + 1,
        error: e instanceof UserFacingError ? e.message : t("error.generic"),
      });
    } catch (storageError) {
      console.error("could not update the upload queue", storageError);
    }
    return true;
  }
}

/** Uploads the photo file and inserts its row. Idempotent across retries. Returns the photo id. */
async function upload(supabase: SupabaseClient, userId: string, item: QueuedCapture): Promise<string> {
  // Check the photo against the fingerprint taken when it was sealed: never upload a damaged copy.
  const photo = await getPhoto(item.localId);
  if (!photo || !photo.byteLength || (await sha256Hex(photo)) !== item.sha256)
    throw new PhotoLostError("This photo was damaged on this phone and can't be sent. Please take it again.");
  const path = `${userId}/${item.localId}.jpg`;
  const up = await supabase.storage
    .from("result-photos")
    .upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error;

  const ins = await supabase
    .from("result_photos")
    .insert({
      unit_id: item.unitId,
      user_id: userId,
      election: item.election ?? DEFAULT_ELECTION,
      image_url: path,
      sha256_hash: item.sha256,
      captured_at: item.capturedAt,
    })
    .select("id")
    .single();
  if (!ins.error) return ins.data.id as string;
  if (ins.error.code !== "23505") throw ins.error; // 23505 = this hash was already inserted on an earlier try

  const existing = await supabase.from("result_photos").select("id").eq("sha256_hash", item.sha256).single();
  if (existing.error) throw existing.error;
  return existing.data.id as string;
}

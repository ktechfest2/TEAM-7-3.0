import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { QueuedCapture } from "../schemas";

/** state/lga are optional: units cached by older versions only had the ward. */
export type CachedUnit = { id: string; code: string; name: string; ward: string; lga?: string; state?: string };

interface CounTrackDB extends DBSchema {
  captures: { key: string; value: QueuedCapture };
  units: { key: string; value: CachedUnit };
}

let dbPromise: Promise<IDBPDatabase<CounTrackDB>> | undefined;
function db() {
  dbPromise ??= openDB<CounTrackDB>("countrack", 1, {
    upgrade(d) {
      d.createObjectStore("captures", { keyPath: "localId" });
      d.createObjectStore("units", { keyPath: "id" });
    },
  });
  return dbPromise;
}

/** Fires "change" whenever a capture is added or updated (same tab). */
export const queueEvents = new EventTarget();
const changed = () => queueEvents.dispatchEvent(new Event("change"));

export async function enqueue(item: QueuedCapture) {
  await (await db()).put("captures", item);
  changed();
}

export async function updateCapture(localId: string, patch: Partial<QueuedCapture>) {
  const d = await db();
  const current = await d.get("captures", localId);
  if (!current) return;
  await d.put("captures", { ...current, ...patch });
  changed();
}

export const getCapture = async (localId: string) => (await db()).get("captures", localId);

/** Newest first. */
export async function listCaptures() {
  const all = await (await db()).getAll("captures");
  return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/** Keeps the unit list available offline for the capture screen. */
export async function cacheUnits(units: CachedUnit[], replace = true) {
  const tx = (await db()).transaction("units", "readwrite");
  if (replace) await tx.store.clear();
  await Promise.all(units.map((u) => tx.store.put(u)));
  await tx.done;
}

export async function cachedUnits() {
  const all = await (await db()).getAll("units");
  return all.sort((a, b) => a.code.localeCompare(b.code));
}

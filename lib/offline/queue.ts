import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DirectoryTree } from "../directory";
import type { QueuedCapture } from "../schemas";

/** state/lga are optional: units cached by older versions only had the ward. */
export type CachedUnit = { id: string; code: string; name: string; ward: string; lga?: string; state?: string; location?: string | null };

/** Offline directory bookkeeping: the State → LGA → Ward tree, and which states' units are saved. */
export type DirectoryMeta =
  | { key: "tree"; snapshot: string | null; savedAt: number; tree: DirectoryTree }
  | { key: `area:${string}`; snapshot: string | null; savedAt: number; count: number };

/**
 * The photo itself, kept apart from its queue entry and stored as plain bytes. Safari cannot
 * reliably store Blobs in IndexedDB ("Error preparing Blob/File data…"), and keeping the
 * bytes in their own store means status updates never rewrite the photo.
 */
type StoredPhoto = { localId: string; bytes: ArrayBuffer; type: string };
/** Queue entries saved by older versions carried the photo as a Blob inside the entry. */
type LegacyCapture = QueuedCapture & { blob?: Blob };

interface CounTrackDB extends DBSchema {
  captures: { key: string; value: LegacyCapture };
  photos: { key: string; value: StoredPhoto };
  units: { key: string; value: CachedUnit; indexes: { area: [string, string, string] } };
  meta: { key: string; value: DirectoryMeta };
}

let dbPromise: Promise<IDBPDatabase<CounTrackDB>> | undefined;
const reset = () => { dbPromise = undefined; };
function db() {
  dbPromise ??= openDB<CounTrackDB>("countrack", 3, {
    // Another tab (or a hot-reloaded copy of this code) wants a newer version: let go of this
    // connection, otherwise its upgrade waits forever and every save on the phone hangs.
    blocking(_current, _next, event) {
      (event.target as IDBDatabase).close();
      reset();
    },
    terminated: reset,
    upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        d.createObjectStore("captures", { keyPath: "localId" });
        d.createObjectStore("units", { keyPath: "id" });
      }
      if (oldVersion < 2) {
        // v2: look units up by ward offline, and remember the directory tree and saved states.
        tx.objectStore("units").createIndex("area", ["state", "lga", "ward"]);
        d.createObjectStore("meta", { keyPath: "key" });
      }
      if (oldVersion < 3) d.createObjectStore("photos", { keyPath: "localId" }); // v3: photo bytes apart
    },
  });
  return dbPromise;
}

/** Fires "change" whenever a capture is added or updated (same tab). */
export const queueEvents = new EventTarget();
const changed = () => queueEvents.dispatchEvent(new Event("change"));

/** Saves a new capture: its queue entry and its JPEG bytes, together. */
export async function enqueue(item: QueuedCapture, bytes: ArrayBuffer) {
  const tx = (await db()).transaction(["captures", "photos"], "readwrite");
  await Promise.all([
    tx.objectStore("captures").put(item),
    tx.objectStore("photos").put({ localId: item.localId, bytes, type: "image/jpeg" }),
    tx.done,
  ]);
  changed();
}

/** Moves an old entry's Blob into the photos store as bytes. False if Safari can no longer read it. */
async function migrateLegacyPhoto(entry: LegacyCapture): Promise<boolean> {
  if (!entry.blob) return true;
  try {
    const bytes = await entry.blob.arrayBuffer();
    if (!bytes.byteLength) return false; // Safari hands back an empty file when it lost the photo
    await (await db()).put("photos", { localId: entry.localId, bytes, type: entry.blob.type || "image/jpeg" });
    return true;
  } catch {
    return false;
  }
}

/** Updates a queue entry's status fields. Never rewrites the photo. */
export async function updateCapture(localId: string, patch: Partial<QueuedCapture>) {
  const d = await db();
  const current = await d.get("captures", localId);
  if (!current) return;
  if (current.blob) await migrateLegacyPhoto(current);
  const { blob: _legacy, ...entry } = current; // eslint-disable-line @typescript-eslint/no-unused-vars
  await d.put("captures", { ...entry, ...patch });
  changed();
}

/** The photo's JPEG bytes, or null if the phone no longer has a readable copy. */
export async function getPhoto(localId: string): Promise<ArrayBuffer | null> {
  const d = await db();
  const stored = await d.get("photos", localId);
  if (stored?.bytes.byteLength) return stored.bytes;
  const legacy = await d.get("captures", localId);
  if (!legacy?.blob || !(await migrateLegacyPhoto(legacy))) return null;
  return (await d.get("photos", localId))?.bytes ?? null;
}

/** Throws away a saved photo the witness no longer wants (drafts only, from the finish prompt). */
export async function deleteCapture(localId: string) {
  const tx = (await db()).transaction(["captures", "photos"], "readwrite");
  await Promise.all([tx.objectStore("captures").delete(localId), tx.objectStore("photos").delete(localId), tx.done]);
  changed();
}

export const getCapture = async (localId: string) => (await db()).get("captures", localId);

/** Newest first. Queue entries only (no photo bytes): cheap to call often. */
export async function listCaptures(): Promise<QueuedCapture[]> {
  const all = await (await db()).getAll("captures");
  return all
    .map(({ blob: _legacy, ...entry }) => entry) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
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

/** Units saved on this phone for one ward (from a state download or an earlier visit). */
export async function cachedUnitsInWard(state: string, lga: string, ward: string) {
  const all = await (await db()).getAllFromIndex("units", "area", [state, lga, ward]);
  return all.sort((a, b) => a.code.localeCompare(b.code));
}

export const cachedUnitByCode = async (code: string) =>
  (await cachedUnits()).find((u) => u.code === code);

export type TreeMeta = Extract<DirectoryMeta, { key: "tree" }>;
export type AreaMeta = Exclude<DirectoryMeta, TreeMeta>;

export const getTreeMeta = async () => (await (await db()).get("meta", "tree")) as TreeMeta | undefined;
export const getAreaMeta = async (state: string) => (await (await db()).get("meta", `area:${state}`)) as AreaMeta | undefined;

export async function putMeta(value: DirectoryMeta) {
  await (await db()).put("meta", value);
}

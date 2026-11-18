import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { browserClient } from "@/lib/supabase/browser";
import type { CheckinStatus } from "./types";

/**
 * Offline queue for Solidarity check-ins. A separate IndexedDB from the result-photo queue
 * (lib/offline/queue.ts), so that one is left exactly as it was.
 */
export type QueuedCheckin = { localId: string; unitId: string; status: CheckinStatus; createdAt: string };

interface SolidarityDB extends DBSchema {
  checkins: { key: string; value: QueuedCheckin };
}

let dbPromise: Promise<IDBPDatabase<SolidarityDB>> | undefined;
const db = () =>
  (dbPromise ??= openDB<SolidarityDB>("countrack-solidarity", 1, {
    upgrade(d) {
      d.createObjectStore("checkins", { keyPath: "localId" });
    },
  }));

export async function enqueueCheckin(unitId: string, status: CheckinStatus): Promise<QueuedCheckin> {
  const item = { localId: crypto.randomUUID(), unitId, status, createdAt: new Date().toISOString() };
  await (await db()).put("checkins", item);
  return item;
}

export const pendingCheckinCount = async () => (await db()).count("checkins");

export type SyncOutcome = { sent: number; pending: number; rateLimited: boolean };

/** Sends every queued check-in. Signs in anonymously if needed. Safe to call often; stays queued on failure. */
export async function syncCheckins(): Promise<SyncOutcome> {
  const d = await db();
  const outcome: SyncOutcome = { sent: 0, pending: await d.count("checkins"), rateLimited: false };
  if (!outcome.pending || !navigator.onLine) return outcome;

  const supabase = browserClient();
  let { data } = await supabase.auth.getSession();
  if (!data.session) {
    const anon = await supabase.auth.signInAnonymously();
    if (anon.error || !anon.data.user) return outcome;
    data = { session: anon.data.session };
  }
  const userId = data.session!.user.id;

  const items = (await d.getAll("checkins")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of items) {
    const { error } = await supabase
      .from("voter_checkins")
      .insert({ unit_id: item.unitId, status: item.status, device_id: userId });
    if (!error) {
      await d.delete("checkins", item.localId);
      outcome.sent++;
    } else if (error.code === "54000") {
      await d.delete("checkins", item.localId); // over the hourly limit: drop it, do not retry forever
      outcome.rateLimited = true;
    } else {
      break; // network or server trouble: keep the rest queued
    }
  }
  outcome.pending = await d.count("checkins");
  return outcome;
}

"use client";

import { useEffect } from "react";
import { listCaptures } from "@/lib/offline/queue";
import { isPending, syncAll } from "@/lib/offline/sync";

const RETRY_MS = 15_000;

/**
 * Registers the service worker (production only) and syncs the queue on load, reconnect,
 * refocus, and every 15 s while anything is still waiting. The timer matters: phones often
 * say they are "online" while the connection is not actually working yet.
 */
export function SyncManager() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }
    const run = () => void syncAll();
    const onVisible = () => document.visibilityState === "visible" && run();
    const tick = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if ((await listCaptures()).some(isPending)) run();
    };
    run();
    const timer = window.setInterval(() => void tick(), RETRY_MS);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

import type { FeedEvent } from "@/lib/feed";
import { INCIDENT_ACTIVE_WINDOW_MS } from "@/lib/sms/incidents";

type IncidentEvent = Extract<FeedEvent, { kind: "incident" }>;
type Snapshot = { savedAt: number; events: IncidentEvent[] };

const KEY = "countrack:incident-feed:v1";
const CODES = new Set(["VUB", "VIO", "MSB", "BOG", "INT"]);

function isIncidentEvent(value: unknown): value is IncidentEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<IncidentEvent>;
  return event.kind === "incident"
    && typeof event.id === "string"
    && typeof event.at === "string"
    && typeof event.reportCount === "number"
    && CODES.has(event.incidentCode ?? "")
    && ["demo", "at_sandbox", "mixed"].includes(event.source ?? "")
    && !!event.unit
    && typeof event.unit.code === "string"
    && typeof event.unit.name === "string";
}

/** Store only public, grouped incident entries. Sender details are never in this cache. */
export function saveIncidentFeed(events: FeedEvent[]): Snapshot | null {
  if (typeof window === "undefined") return null;
  const snapshot = {
    savedAt: Date.now(),
    events: events.filter((event): event is IncidentEvent =>
      event.kind === "incident" && Date.now() - Date.parse(event.at) < INCIDENT_ACTIVE_WINDOW_MS,
    ),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function readIncidentFeed(): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const snapshot = value as { savedAt?: unknown; events?: unknown };
    if (typeof snapshot.savedAt !== "number" || !Array.isArray(snapshot.events)) return null;
    return {
      savedAt: snapshot.savedAt,
      events: snapshot.events.filter((event): event is IncidentEvent =>
        isIncidentEvent(event) && Date.now() - Date.parse(event.at) < INCIDENT_ACTIVE_WINDOW_MS,
      ),
    };
  } catch {
    return null;
  }
}

import "server-only";
import { INCIDENTS, INCIDENT_ACTIVE_WINDOW_MS, type IncidentCode, type IncidentCounts } from "@/lib/sms/incidents";
import { adminClient } from "@/lib/supabase/admin";

/** Exact per-code counts for non-dismissed reports received for this unit in the active window. */
export async function getRecentIncidentCounts(unitId: string): Promise<IncidentCounts> {
  const db = adminClient();
  const since = new Date(Date.now() - INCIDENT_ACTIVE_WINDOW_MS).toISOString();
  const results = await Promise.all(
    (Object.keys(INCIDENTS) as IncidentCode[]).map((code) =>
      db.from("sms_incident_reports")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", unitId)
        .eq("incident_code", code)
        .neq("status", "dismissed")
        .gte("received_at", since),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return Object.fromEntries(results.map((result, index) => [Object.keys(INCIDENTS)[index], result.count ?? 0])) as IncidentCounts;
}

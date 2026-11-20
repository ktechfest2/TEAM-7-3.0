-- Remove data explicitly marked as simulated from the shared database.
-- This is destructive: apply only when the project is ready to stop using the seeded demo.
-- It preserves the seed script for isolated local development databases.

delete from public.sms_incident_reports
where source in ('demo', 'at_sandbox');

delete from public.collation_results
where is_simulated = true;

-- Dependent photos, readings, unit results, check-ins, movement flags, incident reports,
-- discrepancies and evidence packets reference polling_units with ON DELETE CASCADE.
delete from public.polling_units
where is_simulated = true;

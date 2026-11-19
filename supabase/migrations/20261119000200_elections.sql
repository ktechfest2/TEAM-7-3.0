-- One polling unit holds several elections (presidential, governorship, senatorial, local
-- government), each with its own result sheet. Results, collation lines and discrepancies
-- are now kept per (unit, election), so a governorship photo never "disagrees" with a
-- presidential one. Existing rows become 'presidential'.

do $$ begin
  create type public.election_type as enum ('presidential','governorship','senatorial','local_government');
exception when duplicate_object then null; end $$;

alter table public.result_photos
  add column if not exists election public.election_type not null default 'presidential';
create index if not exists result_photos_unit_election_idx on public.result_photos (unit_id, election);
-- Witnesses choose the election when they capture; keep every other column server-owned.
grant insert (election) on public.result_photos to authenticated;

alter table public.unit_results
  add column if not exists election public.election_type not null default 'presidential';
alter table public.unit_results drop constraint if exists unit_results_unit_id_key;
do $$ begin
  alter table public.unit_results add constraint unit_results_unit_election_key unique (unit_id, election);
exception when duplicate_table or duplicate_object then null; end $$;

alter table public.collation_results
  add column if not exists election public.election_type not null default 'presidential';
create index if not exists collation_results_unit_election_idx on public.collation_results (unit_id, election);

alter table public.discrepancies
  add column if not exists election public.election_type not null default 'presidential';
create index if not exists discrepancies_unit_election_idx on public.discrepancies (unit_id, election);

-- CounTrack "Solidarity": anonymous safety check-ins, incident reports, public accountability clock.
-- ADDITIVE ONLY. Nothing here changes an existing table, policy or function.
--
-- Principles enforced in the schema:
--   * Nothing here records, asks about or counts who anyone voted for.
--   * Clients insert raw rows only. Status events are written by the server (service role) after a role check.
--   * The public reads aggregates and statuses through the views/functions at the bottom, never the raw tables.
--   * Raw media lives in a private bucket that only responders can read.
--
-- Constants mirrored in lib/solidarity/config.ts:
--   min public count = 5 | reports per device per hour = 5 | check-ins per device per hour = 20

alter type public.user_role add value if not exists 'responder';

-- ── Helpers ───────────────────────────────────────────────────────────

-- Role check. Compared as text so this file never needs the new enum value in the same transaction.
create or replace function public.is_responder() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users where id = (select auth.uid()) and role::text = 'responder');
$$;

create or replace function public.solidarity_min_public_count() returns int
language sql immutable as $$ select 5 $$;

-- Short code the reporter keeps to check back anonymously (10 hex characters, unique).
create or replace function public.new_receipt_code() returns text
language sql volatile set search_path = '' as $$
  select upper(encode(extensions.gen_random_bytes(5), 'hex'));
$$;

-- ── Tables ────────────────────────────────────────────────────────────

-- device_id is the anonymous auth user id of the phone. It is never exposed publicly.
create table public.voter_checkins (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.polling_units(id) on delete cascade,
  status     text not null check (status in ('on_my_way','voted','home_safe','need_help')),
  device_id  uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.voter_checkins (unit_id, created_at);
create index on public.voter_checkins (device_id, created_at);

create table public.incident_reports (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.polling_units(id) on delete cascade,
  category      text not null check (category in (
                  'vote_buying','intimidation_or_violence','ballot_problem',
                  'officials_late_or_absent','voter_blocked_or_wrong_unit','other')),
  note          text check (char_length(note) <= 280),
  media_path    text,                      -- private storage path: <device_id>/<file>
  media_sha256  text check (media_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at   timestamptz not null default now(),   -- device clock (claimed)
  device_id     uuid not null default auth.uid(),
  receipt_code  text not null unique default public.new_receipt_code(),
  created_at    timestamptz not null default now(),    -- server clock (trusted)
  -- a photo is either fully described (path + fingerprint) or absent
  check ((media_path is null) = (media_sha256 is null))
);
create index on public.incident_reports (unit_id, created_at);
create index on public.incident_reports (device_id, created_at);

create table public.incident_confirmations (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.incident_reports(id) on delete cascade,
  device_id  uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (report_id, device_id)             -- one "I saw this too" per device
);

-- Written ONLY by the server (service role) after a responder role check.
create table public.incident_status_events (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.incident_reports(id) on delete cascade,
  status       text not null check (status in ('seen','responded')),
  responder_id uuid not null references public.users(id) on delete cascade,
  note         text check (char_length(note) <= 280),
  created_at   timestamptz not null default now()
);
create index on public.incident_status_events (report_id, created_at);

-- ── Rule: the reporter's own device cannot confirm its own report ─────
create or replace function public.is_own_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.incident_reports where id = rid and device_id = (select auth.uid()));
$$;

-- ── Rate limit (enforced for every insert path, not just our API) ─────
create or replace function public.enforce_solidarity_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap int; recent int;
begin
  if tg_table_name = 'incident_reports' then
    cap := 5;
    select count(*) into recent from public.incident_reports
      where device_id = new.device_id and created_at > now() - interval '1 hour';
  else
    cap := 20;
    select count(*) into recent from public.voter_checkins
      where device_id = new.device_id and created_at > now() - interval '1 hour';
  end if;
  if recent >= cap then
    raise exception 'rate limit: too many submissions from this device, try again later' using errcode = '54000';
  end if;
  return new;
end $$;

create trigger incident_reports_rate_limit before insert on public.incident_reports
  for each row execute function public.enforce_solidarity_rate_limit();
create trigger voter_checkins_rate_limit before insert on public.voter_checkins
  for each row execute function public.enforce_solidarity_rate_limit();

-- ── RLS: raw tables are private ───────────────────────────────────────
alter table public.voter_checkins         enable row level security;
alter table public.incident_reports       enable row level security;
alter table public.incident_confirmations enable row level security;
alter table public.incident_status_events enable row level security;

-- A device sees only its own raw rows. Responders see everything (their queue).
create policy "own or responder read" on public.voter_checkins
  for select to authenticated using (device_id = (select auth.uid()) or public.is_responder());
create policy "own or responder read" on public.incident_reports
  for select to authenticated using (device_id = (select auth.uid()) or public.is_responder());
create policy "own or responder read" on public.incident_confirmations
  for select to authenticated using (device_id = (select auth.uid()) or public.is_responder());
create policy "responder read" on public.incident_status_events
  for select to authenticated using (public.is_responder());

-- Clients insert raw rows only, as themselves.
create policy "device adds own check-in" on public.voter_checkins
  for insert to authenticated with check (device_id = (select auth.uid()));
create policy "device adds own report" on public.incident_reports
  for insert to authenticated
  with check (
    device_id = (select auth.uid())
    and (media_path is null or split_part(media_path, '/', 1) = (select auth.uid())::text)
  );
create policy "device confirms others' report" on public.incident_confirmations
  for insert to authenticated
  with check (device_id = (select auth.uid()) and not public.is_own_report(report_id));
-- No insert policy on incident_status_events: no client can write one. No update/delete policies anywhere.

-- Clients may set only these columns (receipt_code, created_at are server-owned).
revoke insert, update, delete on public.voter_checkins, public.incident_reports,
  public.incident_confirmations, public.incident_status_events from anon, authenticated;
grant insert (unit_id, status, device_id) on public.voter_checkins to authenticated;
grant insert (unit_id, category, note, media_path, media_sha256, captured_at, device_id)
  on public.incident_reports to authenticated;
grant insert (report_id, device_id) on public.incident_confirmations to authenticated;
grant select on public.voter_checkins, public.incident_reports,
  public.incident_confirmations, public.incident_status_events to authenticated;
revoke all on public.voter_checkins, public.incident_reports,
  public.incident_confirmations, public.incident_status_events from anon;

-- ── Private media bucket: only responders can read ────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('incident-media', 'incident-media', false, 5242880, array['image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "device uploads incident media to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'incident-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "responders read incident media" on storage.objects
  for select to authenticated
  using (bucket_id = 'incident-media' and public.is_responder());

-- ── Public read: aggregates and statuses only ─────────────────────────
-- Views run with their owner's rights, so they can aggregate the private tables.
-- No device ids, no notes, no media paths, no receipt codes, no need_help rows.

-- Public report rows. last_status is the last server-written event (the clock is derived at read time).
create view public.public_incidents as
select
  r.id, r.unit_id, r.category, r.created_at,
  (r.media_sha256 is not null) as has_media,
  (select count(*)::int from public.incident_confirmations c
     where c.report_id = r.id and c.device_id <> r.device_id) as confirmations,
  e.status     as last_status,
  e.created_at as last_status_at
from public.incident_reports r
left join lateral (
  select s.status, s.created_at from public.incident_status_events s
  where s.report_id = r.id order by s.created_at desc limit 1
) e on true;

-- Safety totals per unit. need_help never appears, and a unit with too few check-ins has no row at all.
create view public.public_unit_safety as
select
  unit_id,
  count(*) filter (where status = 'on_my_way')::int as on_my_way,
  count(*) filter (where status = 'voted')::int     as voted,
  count(*) filter (where status = 'home_safe')::int as home_safe,
  count(*)::int                                     as total
from public.voter_checkins
where status <> 'need_help'
group by unit_id
having count(*) >= public.solidarity_min_public_count();

grant select on public.public_incidents, public.public_unit_safety to anon, authenticated;

-- Anonymous receipt lookup: whoever holds the code can check back. No login, no device id.
create or replace function public.receipt_lookup(code text)
returns table (id uuid, unit_id uuid, category text, created_at timestamptz,
               has_media boolean, confirmations int, last_status text, last_status_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.unit_id, p.category, p.created_at, p.has_media, p.confirmations, p.last_status, p.last_status_at
  from public.public_incidents p
  join public.incident_reports r on r.id = p.id
  where r.receipt_code = upper(code);
$$;
revoke execute on function public.receipt_lookup(text) from public;
grant  execute on function public.receipt_lookup(text) to anon, authenticated;

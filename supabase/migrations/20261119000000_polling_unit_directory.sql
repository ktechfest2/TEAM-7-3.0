-- Real polling-unit directory metadata. Existing SIM-* demo rows remain intact.
alter table public.polling_units
  add column if not exists location text,
  add column if not exists directory_source text,
  add column if not exists directory_snapshot text,
  add column if not exists directory_is_current boolean not null default true;

create index if not exists polling_units_real_area_idx
  on public.polling_units (state, lga, ward)
  where is_simulated = false and directory_is_current = true;

create table if not exists public.polling_unit_directory_states (
  code text primary key,
  name text not null,
  directory_snapshot text not null,
  directory_is_current boolean not null default true
);

create table if not exists public.polling_unit_directory_lgas (
  state_code text not null references public.polling_unit_directory_states(code),
  code text not null,
  name text not null,
  state_name text not null,
  directory_snapshot text not null,
  directory_is_current boolean not null default true,
  primary key (state_code, code)
);

create table if not exists public.polling_unit_directory_wards (
  state_code text not null,
  lga_code text not null,
  code text not null,
  name text not null,
  state_name text not null,
  lga_name text not null,
  directory_snapshot text not null,
  directory_is_current boolean not null default true,
  primary key (state_code, lga_code, code),
  foreign key (state_code, lga_code)
    references public.polling_unit_directory_lgas(state_code, code)
);

create index if not exists polling_unit_directory_lgas_state_idx
  on public.polling_unit_directory_lgas (state_name, name)
  where directory_is_current = true;
create index if not exists polling_unit_directory_wards_area_idx
  on public.polling_unit_directory_wards (state_name, lga_name, name)
  where directory_is_current = true;

alter table public.polling_unit_directory_states enable row level security;
alter table public.polling_unit_directory_lgas enable row level security;
alter table public.polling_unit_directory_wards enable row level security;

create policy "public read directory states" on public.polling_unit_directory_states
  for select to anon, authenticated using (directory_is_current = true);
create policy "public read directory LGAs" on public.polling_unit_directory_lgas
  for select to anon, authenticated using (directory_is_current = true);
create policy "public read directory wards" on public.polling_unit_directory_wards
  for select to anon, authenticated using (directory_is_current = true);

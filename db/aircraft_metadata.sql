-- Estuaire — Live Contrail Map
-- Per-aircraft metadata enriched from hexdb.io (free, community-run ADSB DB).
-- Populated by the .github/workflows/enrich-metadata.yml hourly cron.
-- One row per icao24; 404s from hexdb still get a row (with nulls) so we
-- don't keep re-trying the same dead hex.

create table if not exists public.aircraft_metadata (
  icao24        text         primary key,
  type_code     text,                       -- ICAO type designator e.g. A20N, B738
  manufacturer  text,
  model         text,
  operator      text,
  registration  text,
  fetched_at    timestamptz  not null default now()
);

create index if not exists aircraft_metadata_type_code_idx
  on public.aircraft_metadata (type_code);

alter table public.aircraft_metadata enable row level security;

-- Anon can read.
drop policy if exists "aircraft_metadata_read" on public.aircraft_metadata;
create policy "aircraft_metadata_read"
  on public.aircraft_metadata
  for select
  using (true);

-- Writes restricted to service_role (bypasses RLS).

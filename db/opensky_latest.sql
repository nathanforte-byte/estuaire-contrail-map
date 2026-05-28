-- Estuaire — Live Contrail Map
-- Single-row snapshot table: the GitHub Action fetcher upserts the latest
-- enriched Europe state every ~5 min; the Vercel function reads from it.

create table if not exists public.opensky_latest (
  bbox          text         primary key,            -- 'europe' for now
  fetched_at    timestamptz  not null default now(),
  flight_count  int          not null default 0,
  payload       jsonb        not null                 -- {flights: [...], bbox: [...]}
);

create index if not exists opensky_latest_fetched_at_idx
  on public.opensky_latest (fetched_at desc);

alter table public.opensky_latest enable row level security;

-- Anyone (anon) can read the snapshot — it is public flight data.
drop policy if exists "opensky_latest_read_all" on public.opensky_latest;
create policy "opensky_latest_read_all"
  on public.opensky_latest
  for select
  using (true);

-- Writes are restricted to service_role (which bypasses RLS by design).
-- No insert/update policies for anon → anon cannot write.

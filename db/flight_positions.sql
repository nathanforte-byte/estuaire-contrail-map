-- Append-only positions table — only flights classified "persistent" are stored,
-- to keep storage tiny (~3 MB/day) while supporting 24h+ trajectory replay.
-- Joined back to flights by icao24, time-ordered.

create table if not exists public.flight_positions (
  ts           timestamptz       not null default now(),
  icao24       text              not null,
  callsign     text,
  country      text,
  lat          double precision  not null,
  lon          double precision  not null,
  alt_ft       int,
  heading      double precision,
  primary key (icao24, ts)
);

create index if not exists flight_positions_ts_idx
  on public.flight_positions (ts desc);

create index if not exists flight_positions_icao24_ts_idx
  on public.flight_positions (icao24, ts desc);

alter table public.flight_positions enable row level security;

drop policy if exists "flight_positions_read_all" on public.flight_positions;
create policy "flight_positions_read_all"
  on public.flight_positions
  for select
  using (true);

"""Daily trajectories fetcher.

Reads the icao24 list of flights flagged "persistent" in flight_positions over
the last 24 hours, then asks OpenSky for the real trajectory (`/tracks`) and
the origin/destination airport pair (`/flights/aircraft`). Upserts into
flight_trajectories.

Designed to run once a day from GitHub Actions. Budget: ~200-500 persistent
icao24s × ~5 credits per /tracks + /flights call = 1-3k OpenSky credits, well
inside the 4000/day quota.

Why not just call /flights/all over Europe?  Too broad (>10k flights/day),
most of them never reach cruise altitude or never enter ISSR. We only care
about flights we already classified as persistent.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "frontend" / "api"))

from opensky import _tokens  # noqa: E402

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENSKY_BASE = "https://opensky-network.org/api"
LOOKBACK_HOURS = int(os.environ.get("LOOKBACK_HOURS", "24"))
CONCURRENCY = int(os.environ.get("CONCURRENCY", "6"))


def _supabase_headers(prefer: str = "return=minimal") -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


async def fetch_persistent_icao24s(client: httpx.AsyncClient) -> list[str]:
    """Distinct icao24s seen as persistent in the last LOOKBACK_HOURS."""
    cutoff = quote((datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat())
    url = (
        f"{SUPABASE_URL}/rest/v1/flight_positions"
        f"?ts=gte.{cutoff}"
        f"&select=icao24,callsign,country,lat,lon,ts"
        f"&order=ts.desc"
        f"&limit=50000"
    )
    r = await client.get(url, headers=_supabase_headers())
    r.raise_for_status()
    rows = r.json()
    by_icao: dict[str, dict] = {}
    for row in rows:
        if row["icao24"] not in by_icao:
            by_icao[row["icao24"]] = row
    return list(by_icao.keys()), by_icao


async def opensky_get(client: httpx.AsyncClient, path: str, params: dict) -> dict | None:
    """Authed GET against OpenSky. Returns parsed JSON or None on 404/empty."""
    token = await _tokens.get(client)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = await client.get(f"{OPENSKY_BASE}{path}", params=params, headers=headers)
    if r.status_code == 404:
        return None
    if r.status_code == 401 and token:
        _tokens._expires_at = 0.0
        token = await _tokens.get(client)
        headers["Authorization"] = f"Bearer {token}"
        r = await client.get(f"{OPENSKY_BASE}{path}", params=params, headers=headers)
    r.raise_for_status()
    if not r.text:
        return None
    return r.json()


async def fetch_one_trajectory(
    client: httpx.AsyncClient,
    icao24: str,
    sample_row: dict,
    sem: asyncio.Semaphore,
) -> dict | None:
    """Return a flight_trajectories row dict, or None if no usable track."""
    async with sem:
        track = await opensky_get(client, "/tracks/all", {"icao24": icao24, "time": 0})

    if not track or not track.get("path"):
        return None

    path = track["path"]
    # Each waypoint: [time, lat, lon, baro_altitude_m, true_track, on_ground]
    waypoints = []
    for p in path:
        t, lat, lon, alt_m, _track, on_ground = (p + [None] * 6)[:6]
        if lat is None or lon is None:
            continue
        waypoints.append({
            "t": int(t) if t else None,
            "lat": float(lat),
            "lon": float(lon),
            "alt_ft": round(float(alt_m) * 3.28084) if alt_m is not None else None,
            "on_ground": bool(on_ground),
        })
    if len(waypoints) < 3:
        return None

    start_unix = track.get("startTime") or waypoints[0]["t"]
    end_unix = track.get("endTime") or waypoints[-1]["t"]

    # Try to enrich with origin/destination via /flights/aircraft (yesterday's batched data).
    origin = destination = None
    try:
        yday = datetime.now(timezone.utc) - timedelta(hours=24)
        begin = int((yday - timedelta(hours=12)).timestamp())
        end = int((yday + timedelta(hours=24)).timestamp())
        flights = await opensky_get(client, "/flights/aircraft", {
            "icao24": icao24, "begin": begin, "end": end,
        })
        if flights:
            # pick the flight closest in time to our track midpoint
            mid = ((start_unix or 0) + (end_unix or 0)) // 2 if start_unix and end_unix else 0
            best = min(flights, key=lambda f: abs((f.get("firstSeen") or 0) - mid))
            origin = best.get("estDepartureAirport")
            destination = best.get("estArrivalAirport")
    except httpx.HTTPError:
        pass  # enrichment is best-effort

    return {
        "icao24": icao24,
        "date_utc": (datetime.now(timezone.utc) - timedelta(hours=12)).date().isoformat(),
        "callsign": (track.get("callsign") or sample_row.get("callsign") or "").strip() or None,
        "country": sample_row.get("country"),
        "origin_icao": (origin or "").upper() or None,
        "destination_icao": (destination or "").upper() or None,
        "start_ts": datetime.fromtimestamp(start_unix, tz=timezone.utc).isoformat() if start_unix else None,
        "end_ts": datetime.fromtimestamp(end_unix, tz=timezone.utc).isoformat() if end_unix else None,
        "waypoints": waypoints,
    }


async def upsert_trajectories(client: httpx.AsyncClient, rows: list[dict]) -> None:
    if not rows:
        return
    # PostgREST upsert in batches of 500 to stay under request limits.
    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/flight_trajectories?on_conflict=icao24",
            headers=_supabase_headers("resolution=merge-duplicates,return=minimal"),
            content=json.dumps(batch),
        )
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase upsert {r.status_code}: {r.text[:300]}")


async def main() -> None:
    t0 = time.time()
    print(f"[traj] lookback={LOOKBACK_HOURS}h concurrency={CONCURRENCY}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        icao24s, sample_by_icao = await fetch_persistent_icao24s(client)
        print(f"[traj] {len(icao24s)} distinct persistent icao24s in last {LOOKBACK_HOURS}h ({time.time()-t0:.1f}s)")

        sem = asyncio.Semaphore(CONCURRENCY)
        results = await asyncio.gather(
            *(fetch_one_trajectory(client, ic, sample_by_icao[ic], sem) for ic in icao24s),
            return_exceptions=True,
        )

    rows: list[dict] = []
    errors = 0
    skipped = 0
    for r in results:
        if isinstance(r, Exception):
            errors += 1
            continue
        if r is None:
            skipped += 1
            continue
        rows.append(r)

    print(f"[traj] tracks fetched: {len(rows)}/{len(icao24s)} (skipped={skipped} errors={errors}) ({time.time()-t0:.1f}s)")

    async with httpx.AsyncClient(timeout=60.0) as client:
        await upsert_trajectories(client, rows)
    print(f"[traj] upserted {len(rows)} rows in {time.time()-t0:.1f}s total")


if __name__ == "__main__":
    asyncio.run(main())

"""Hourly aircraft-metadata enricher.

For every icao24 we have seen in flight_positions but do not yet have a row
for in aircraft_metadata, fetch the type / manufacturer / model / operator /
registration from hexdb.io and upsert.

hexdb.io is a free, community-run ADSB database. No auth, but we cap ourselves
at ~1 req/sec / single concurrent connection so we are good neighbours.

404s still write a row (with nulls) so we don't keep retrying the same hex
forever. Successful rows include type_code (ICAO designator like A20N, B738)
which the frontend uses as a filter dimension.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEXDB_BASE = "https://hexdb.io/api/v1/aircraft"
LOOKBACK_HOURS = int(os.environ.get("LOOKBACK_HOURS", "24"))
# Cap per-run so the first execution doesn't try to scrape 5000 hexes in a row.
# Subsequent runs catch up quickly because the eligible-set shrinks.
MAX_PER_RUN = int(os.environ.get("MAX_PER_RUN", "600"))
RATE_LIMIT_SECONDS = float(os.environ.get("RATE_LIMIT_SECONDS", "1.0"))
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "12.0"))


def _supabase_headers(prefer: str = "return=minimal") -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


async def fetch_eligible_icao24s(client: httpx.AsyncClient) -> list[str]:
    """icao24s we have seen recently that are NOT yet in aircraft_metadata."""
    cutoff = quote((datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat())

    # 1. distinct icao24 seen in flight_positions over lookback window
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/flight_positions"
        f"?ts=gte.{cutoff}&select=icao24&limit=50000",
        headers=_supabase_headers(),
    )
    r.raise_for_status()
    seen = {row["icao24"] for row in r.json() if row.get("icao24")}

    if not seen:
        return []

    # 2. icao24s already enriched (any time)
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/aircraft_metadata?select=icao24&limit=50000",
        headers=_supabase_headers(),
    )
    r.raise_for_status()
    known = {row["icao24"] for row in r.json() if row.get("icao24")}

    pending = sorted(seen - known)
    return pending


async def fetch_hexdb(client: httpx.AsyncClient, icao24: str) -> dict:
    """Return a metadata row for icao24. Always returns a dict (404 → nulls)."""
    url = f"{HEXDB_BASE}/{icao24.upper()}"
    try:
        r = await client.get(url, timeout=REQUEST_TIMEOUT)
    except httpx.HTTPError:
        # Network blip — return null row so we still write it and don't retry next run.
        return _null_row(icao24)

    if r.status_code == 404:
        return _null_row(icao24)
    if r.status_code >= 400:
        # Transient server error from hexdb — also write a null row so we move on.
        return _null_row(icao24)

    try:
        data = r.json()
    except Exception:
        return _null_row(icao24)

    return {
        "icao24": icao24,
        "type_code": _clean(data.get("ICAOTypeCode")),
        "manufacturer": _clean(data.get("Manufacturer")),
        "model": _clean(data.get("Type")),
        "operator": _clean(data.get("RegisteredOwners")),
        "registration": _clean(data.get("Registration")),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _null_row(icao24: str) -> dict:
    return {
        "icao24": icao24,
        "type_code": None,
        "manufacturer": None,
        "model": None,
        "operator": None,
        "registration": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


async def upsert_metadata(client: httpx.AsyncClient, rows: list[dict]) -> None:
    if not rows:
        return
    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/aircraft_metadata?on_conflict=icao24",
            headers=_supabase_headers("resolution=merge-duplicates,return=minimal"),
            content=json.dumps(batch),
        )
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase upsert {r.status_code}: {r.text[:300]}")


async def main() -> None:
    t0 = time.time()
    print(f"[meta] lookback={LOOKBACK_HOURS}h max_per_run={MAX_PER_RUN} rate={RATE_LIMIT_SECONDS}s")

    async with httpx.AsyncClient(timeout=30.0) as client:
        pending = await fetch_eligible_icao24s(client)
        print(f"[meta] {len(pending)} pending icao24s ({time.time()-t0:.1f}s)")
        if len(pending) > MAX_PER_RUN:
            print(f"[meta] capping to {MAX_PER_RUN} this run; remainder rolls to next hour")
            pending = pending[:MAX_PER_RUN]

        rows: list[dict] = []
        ok = 0
        nulls = 0
        # Single concurrent connection + sleep between calls = polite to hexdb.
        for ic in pending:
            row = await fetch_hexdb(client, ic)
            rows.append(row)
            if row["type_code"] is not None:
                ok += 1
            else:
                nulls += 1
            await asyncio.sleep(RATE_LIMIT_SECONDS)

        print(f"[meta] fetched {len(rows)} rows (resolved={ok}, null={nulls}) in {time.time()-t0:.1f}s")
        await upsert_metadata(client, rows)
        print(f"[meta] upserted {len(rows)} rows; total {time.time()-t0:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())

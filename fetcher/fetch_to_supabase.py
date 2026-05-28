"""Fetcher: OpenSky → weather → contrail classify → Supabase upsert.

Runs on GitHub Actions (Azure egress reaches OpenSky cleanly, unlike GCP/AWS/CF).
Imports the shared modules from frontend/api/ so we have a single source of truth
for the model.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

# Bring the shared modules onto sys.path.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "frontend" / "api"))

from contrail import classify  # noqa: E402
from opensky import EUROPE_BBOX, Flight, fetch_states  # noqa: E402
from weather import altitude_to_pressure_hpa, fetch_weather_at  # noqa: E402

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BBOX_NAME = os.environ.get("BBOX_NAME", "europe")


def _grid_key(lat: float, lon: float, p: int) -> tuple[int, int, int]:
    return (round(lat), round(lon), p)


async def enrich(flights: list[Flight]) -> list[dict]:
    # Pre-compute the unique (lat°, lon°, pressure) grid points we need.
    needed: dict[tuple[int, int, int], None] = {}
    for f in flights:
        if f.alt_ft is None or f.alt_ft <= 25000:
            continue
        needed[_grid_key(f.lat, f.lon, altitude_to_pressure_hpa(f.alt_ft))] = None

    weather: dict[tuple[int, int, int], object] = {}
    sem = asyncio.Semaphore(12)

    async with httpx.AsyncClient(timeout=20.0) as client:
        async def get_one(k: tuple[int, int, int]):
            lat, lon, p = k
            async with sem:
                w = await fetch_weather_at(client, lat, lon, p)
            if w is not None:
                weather[k] = w

        await asyncio.gather(*(get_one(k) for k in needed))

    out: list[dict] = []
    for f in flights:
        risk = "unknown"
        if f.alt_ft is not None and f.alt_ft > 25000:
            p = altitude_to_pressure_hpa(f.alt_ft)
            w = weather.get(_grid_key(f.lat, f.lon, p))
            if w is not None:
                risk = classify(w.temp_c, w.rh_percent, p)  # type: ignore[attr-defined]
        elif f.alt_ft is not None and f.alt_ft <= 25000:
            risk = "none"
        out.append({
            "icao24": f.icao24,
            "callsign": f.callsign,
            "country": f.origin_country,
            "lat": f.lat,
            "lon": f.lon,
            "alt_ft": round(f.alt_ft) if f.alt_ft else None,
            "heading": f.heading,
            "velocity_ms": f.velocity_ms,
            "risk": risk,
        })
    return out


async def upsert_snapshot(payload: dict) -> None:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    row = {
        "bbox": BBOX_NAME,
        "fetched_at": payload["fetched_at"],
        "flight_count": payload["count"],
        "payload": payload,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/opensky_latest?on_conflict=bbox",
            headers=headers,
            content=json.dumps(row),
        )
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase upsert {r.status_code}: {r.text[:300]}")


async def main() -> None:
    t0 = time.time()
    print(f"[fetcher] starting bbox={BBOX_NAME}")

    states = await fetch_states(EUROPE_BBOX)
    print(f"[fetcher] OpenSky returned {len(states)} airborne states in {time.time()-t0:.1f}s")

    enriched = await enrich(states)
    risks: dict[str, int] = {}
    for f in enriched:
        risks[f["risk"]] = risks.get(f["risk"], 0) + 1
    print(f"[fetcher] enriched {len(enriched)} | risks={risks} | {time.time()-t0:.1f}s")

    payload = {
        "count": len(enriched),
        "bbox": list(EUROPE_BBOX),
        "flights": enriched,
        "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    await upsert_snapshot(payload)
    print(f"[fetcher] upserted snapshot to Supabase in {time.time()-t0:.1f}s total")


if __name__ == "__main__":
    asyncio.run(main())

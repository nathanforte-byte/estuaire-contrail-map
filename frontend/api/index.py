"""FastAPI app: /api/flights returns the latest enriched snapshot from Supabase.

Data flow:
  GH Actions cron (every 5 min)
    → fetch OpenSky + Open-Meteo + classify
    → upsert into Supabase opensky_latest (single row keyed by bbox)
  Vercel function (this file)
    → SELECT latest from Supabase
    → return JSON to browser

This indirection exists because OpenSky's ETH Zurich servers blacklist all major
hyperscaler egress (GCP, AWS, CF). Only GitHub Actions runners (Azure) pass.
"""
from __future__ import annotations

import os
import sys
import time

# Vercel runs this file via its own entrypoint, so the api/ dir isn't on sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Estuaire — Live Contrail Map")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
BBOX_NAME = os.getenv("BBOX_NAME", "europe").strip()

# Tiny per-instance cache to avoid hammering Supabase on busy CDN nodes.
_CACHE: dict[str, tuple[float, dict]] = {}
SNAPSHOT_TTL = 30  # s — Supabase rows refresh every ~5 min, 30s is plenty


def _cached(key: str, ttl: int) -> dict | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    ts, val = hit
    if time.time() - ts > ttl:
        return None
    return val


def _store(key: str, val: dict) -> None:
    _CACHE[key] = (time.time(), val)


@app.get("/api/flights")
async def flights():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Supabase env vars missing on Vercel")

    cached = _cached("snapshot", SNAPSHOT_TTL)
    if cached is not None:
        return JSONResponse(cached)

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    url = (
        f"{SUPABASE_URL}/rest/v1/opensky_latest"
        f"?bbox=eq.{BBOX_NAME}"
        f"&select=fetched_at,flight_count,payload"
        f"&limit=1"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            rows = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Supabase upstream: {type(e).__name__}: {e!r}") from e

    if not rows:
        raise HTTPException(
            503,
            "No snapshot available yet — the GitHub Action cron has not run for the first time.",
        )

    row = rows[0]
    payload = row["payload"]
    # Make sure the response carries the snapshot age so the UI can show a "last updated" badge.
    payload["fetched_at"] = row.get("fetched_at") or payload.get("fetched_at")
    _store("snapshot", payload)
    return payload


@app.get("/api/trajectories")
async def trajectories(hours: int = 24):
    """GeoJSON FeatureCollection: real flight tracks (from OpenSky /tracks)
    for every icao24 we flagged as persistent in the lookback window.
    Populated daily by the .github/workflows/daily-trajectories.yml cron.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Supabase env vars missing on Vercel")
    hours = max(1, min(hours, 168))  # [1h, 7d]

    cache_key = f"traj:{hours}"
    cached = _cached(cache_key, SNAPSHOT_TTL)
    if cached is not None:
        return JSONResponse(cached)

    from datetime import datetime, timedelta, timezone
    from urllib.parse import quote
    cutoff = quote((datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat())

    url = (
        f"{SUPABASE_URL}/rest/v1/flight_trajectories"
        f"?fetched_at=gte.{cutoff}"
        f"&order=fetched_at.desc"
        f"&select=icao24,callsign,country,origin_icao,destination_icao,start_ts,end_ts,waypoints"
        f"&limit=2000"
    )
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            rows = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Supabase upstream: {type(e).__name__}: {e!r}") from e

    features = []
    for row in rows:
        wps = row.get("waypoints") or []
        # Drop on-ground waypoints to avoid taxi/ramp segments dominating the line.
        coords = [[w["lon"], w["lat"]] for w in wps if not w.get("on_ground")]
        if len(coords) < 2:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "icao24": row["icao24"],
                "callsign": row.get("callsign"),
                "country": row.get("country"),
                "origin_icao": row.get("origin_icao"),
                "destination_icao": row.get("destination_icao"),
                "points": len(coords),
                "start_ts": row.get("start_ts"),
                "end_ts": row.get("end_ts"),
            },
        })

    payload = {
        "type": "FeatureCollection",
        "features": features,
        "hours": hours,
        "track_count": len(features),
    }
    _store(cache_key, payload)
    return payload


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "estuaire-contrail-map"}

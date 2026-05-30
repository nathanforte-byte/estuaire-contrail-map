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

    # Stamp aircraft_type onto each flight using a single bulk PostgREST lookup.
    # Worst-case payload here is the icao24 list serialised into a URL filter
    # (a few hundred → a few thousand chars), still well below Vercel's limits.
    flights_list = payload.get("flights") or []
    icaos = list({f.get("icao24") for f in flights_list if f.get("icao24")})
    type_by_icao = await _aircraft_types(icaos)
    for f in flights_list:
        t = type_by_icao.get(f.get("icao24"))
        if t:
            f["aircraft_type"] = t

    _store("snapshot", payload)
    return payload


async def _aircraft_types(icao24s: list[str]) -> dict[str, str]:
    """Bulk lookup of aircraft_metadata.type_code keyed by icao24.

    Returns {} if no rows or on any upstream error — never blocks the response.
    Cached in-process for SNAPSHOT_TTL to amortise across requests.
    """
    if not icao24s:
        return {}
    cache_key = "aircraft_types:" + str(hash(tuple(sorted(icao24s))))
    cached = _cached(cache_key, SNAPSHOT_TTL)
    if cached is not None:
        return cached  # type: ignore[return-value]

    # PostgREST `in.(a,b,c)` filter. Chunk the request to keep URLs reasonable.
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    out: dict[str, str] = {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for i in range(0, len(icao24s), 200):
                chunk = icao24s[i : i + 200]
                in_list = ",".join(chunk)
                url = (
                    f"{SUPABASE_URL}/rest/v1/aircraft_metadata"
                    f"?icao24=in.({in_list})"
                    f"&select=icao24,type_code"
                )
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                for row in r.json():
                    tc = row.get("type_code")
                    if tc:
                        out[row["icao24"]] = tc
    except httpx.HTTPError:
        return out  # partial is fine; UI degrades gracefully

    _store(cache_key, out)
    return out


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

    # Stamp aircraft_type from the metadata table on each row.
    icaos = list({row["icao24"] for row in rows if row.get("icao24")})
    type_by_icao = await _aircraft_types(icaos)

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
                "aircraft_type": type_by_icao.get(row["icao24"]),
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


@app.get("/api/trajectories-snapshot")
async def trajectories_snapshot(hours: int = 6, max_rows: int = 30000):
    """GeoJSON FeatureCollection: pseudo-trajectories built by stitching
    the 5-min snapshot positions of EVERY airborne flight observed in the
    last `hours` hours. One LineString per icao24, sorted by ts.

    Unlike `/api/trajectories` (which returns real OpenSky `/tracks` only
    for persistent-classified icao24s), this view includes every flight —
    persistent or not. Trade-off: coarser (5-min sampling, ~12 points/day
    per flight) and bigger payload.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Supabase env vars missing on Vercel")
    hours = max(1, min(hours, 36))
    max_rows = max(1000, min(max_rows, 50000))

    cache_key = f"traj-snap:{hours}:{max_rows}"
    cached = _cached(cache_key, SNAPSHOT_TTL)
    if cached is not None:
        return JSONResponse(cached)

    from datetime import datetime, timedelta, timezone
    from urllib.parse import quote
    cutoff = quote((datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat())

    base_url = (
        f"{SUPABASE_URL}/rest/v1/flight_positions"
        f"?ts=gte.{cutoff}"
        f"&order=icao24,ts"
        f"&select=icao24,callsign,country,ts,lat,lon,alt_ft,risk"
    )
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    # Supabase hard-caps the response at 1000 rows on the anon role. We
    # paginate explicitly until we hit max_rows or run out of data.
    rows: list[dict] = []
    PAGE = 1000
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            offset = 0
            while len(rows) < max_rows:
                page_url = f"{base_url}&limit={PAGE}&offset={offset}"
                r = await client.get(page_url, headers=headers)
                r.raise_for_status()
                page = r.json()
                if not page:
                    break
                rows.extend(page)
                if len(page) < PAGE:
                    break
                offset += PAGE
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Supabase upstream: {type(e).__name__}: {e!r}") from e

    # Group by icao24 (rows are already ordered by icao24, ts).
    by_icao: dict[str, list[dict]] = {}
    for row in rows:
        by_icao.setdefault(row["icao24"], []).append(row)

    # Bulk-lookup aircraft metadata (type_code) for everything we'll return.
    icaos = list(by_icao.keys())
    type_by_icao = await _aircraft_types(icaos)

    features = []
    for icao24, pts in by_icao.items():
        if len(pts) < 2:
            continue
        # Dominant risk over the trajectory = the most-persistent class seen,
        # so a flight that crossed an ISSR at any point reads as persistent.
        risks = {p.get("risk") for p in pts}
        dominant = (
            "persistent" if "persistent" in risks
            else "short" if "short" in risks
            else "none" if "none" in risks
            else "unknown"
        )
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[p["lon"], p["lat"]] for p in pts],
            },
            "properties": {
                "icao24": icao24,
                "callsign": pts[-1].get("callsign"),
                "country": pts[-1].get("country"),
                "aircraft_type": type_by_icao.get(icao24),
                "risk": dominant,
                "points": len(pts),
                "first_ts": pts[0]["ts"],
                "last_ts": pts[-1]["ts"],
            },
        })

    payload = {
        "type": "FeatureCollection",
        "features": features,
        "hours": hours,
        "track_count": len(features),
        "raw_position_count": len(rows),
    }
    _store(cache_key, payload)
    return payload


@app.get("/api/positions")
async def positions(hours: int = 12, max_rows: int = 60000):
    """Flat list of every flight position observed over the last `hours` h.
    Frontend groups by `ts` to drive the time-scrubber: each 5-min bucket
    becomes one playable frame on the globe.

    Stamps aircraft_type from aircraft_metadata in a single bulk lookup so
    the tooltip can show the airframe without an extra round-trip.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Supabase env vars missing on Vercel")
    hours = max(1, min(hours, 36))
    max_rows = max(1000, min(max_rows, 80000))

    cache_key = f"pos:{hours}:{max_rows}"
    cached = _cached(cache_key, SNAPSHOT_TTL)
    if cached is not None:
        return JSONResponse(cached)

    from datetime import datetime, timedelta, timezone
    from urllib.parse import quote
    cutoff = quote((datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat())

    base_url = (
        f"{SUPABASE_URL}/rest/v1/flight_positions"
        f"?ts=gte.{cutoff}"
        f"&order=ts.desc,icao24"
        f"&select=icao24,callsign,country,ts,lat,lon,alt_ft,heading,risk"
    )
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    rows: list[dict] = []
    PAGE = 1000
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            offset = 0
            while len(rows) < max_rows:
                page_url = f"{base_url}&limit={PAGE}&offset={offset}"
                r = await client.get(page_url, headers=headers)
                r.raise_for_status()
                page = r.json()
                if not page:
                    break
                rows.extend(page)
                if len(page) < PAGE:
                    break
                offset += PAGE
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Supabase upstream: {type(e).__name__}: {e!r}") from e

    # Bulk-lookup aircraft type for the distinct icao24s we'll send back.
    icaos = list({row["icao24"] for row in rows if row.get("icao24")})
    type_by_icao = await _aircraft_types(icaos)
    for row in rows:
        t = type_by_icao.get(row.get("icao24"))
        if t:
            row["aircraft_type"] = t

    # Buckets sorted descending (most recent first) so the UI can default to
    # the latest one without scanning the whole list.
    bucket_set = sorted({row["ts"] for row in rows}, reverse=True)

    payload = {
        "hours": hours,
        "position_count": len(rows),
        "buckets": bucket_set,
        "positions": rows,
    }
    _store(cache_key, payload)
    return payload


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "estuaire-contrail-map"}


@app.get("/api/probe-adsb")
async def probe_adsb():
    """Temporary diagnostic: can the Vercel function reach api.adsb.lol?
    Returns the round-trip timing + first-flight sample so we know if the data
    quality is usable. Delete once we've decided whether to migrate.
    """
    import time as _t
    t0 = _t.time()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get("https://api.adsb.lol/v2/lat/50/lon/10/dist/1500")
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e!r}", "elapsed_s": round(_t.time() - t0, 2)}

    acs = data.get("ac") or []
    airborne = [a for a in acs if a.get("lat") and a.get("lon") and a.get("alt_baro") not in (None, "ground")]
    with_oat = sum(1 for a in airborne if a.get("oat") is not None)
    sample = None
    if airborne:
        a = airborne[0]
        sample = {k: a.get(k) for k in ("hex", "flight", "r", "t", "alt_baro", "gs", "oat", "lat", "lon", "category")}
    return {
        "ok": True,
        "elapsed_s": round(_t.time() - t0, 2),
        "total_ac": len(acs),
        "airborne_with_pos": len(airborne),
        "with_oat_pct": round(100 * with_oat / max(len(airborne), 1)),
        "sample": sample,
    }

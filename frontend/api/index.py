"""FastAPI app: /api/flights returns live flights enriched with contrail risk."""
from __future__ import annotations

import asyncio
import os
import sys
import time

# Vercel runs this file via its own entrypoint, so the api/ dir isn't on sys.path.
# Add it so the sibling modules (contrail, opensky, weather) resolve.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from contrail import classify
from opensky import EUROPE_BBOX, Flight, fetch_states
from weather import WeatherSample, altitude_to_pressure_hpa, fetch_weather_at

app = FastAPI(title="Estuaire — Live Contrail Map")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Tiny in-memory cache: weather varies slowly, OpenSky is rate-limited.
_CACHE: dict[str, tuple[float, object]] = {}
WEATHER_TTL = 1800   # 30 min — upper-air conditions evolve slowly
# OpenSky budget: authenticated = 4000 credits/day, Europe bbox = 4 credits/call.
# 90 s cache → ~960 calls/day → ~3840 credits/day → fits comfortably in 4000.
FLIGHTS_TTL = 90


def _cached(key: str, ttl: int):
    hit = _CACHE.get(key)
    if hit is None:
        return None
    ts, val = hit
    if time.time() - ts > ttl:
        return None
    return val


def _store(key: str, val) -> None:
    _CACHE[key] = (time.time(), val)


def _weather_grid_key(lat: float, lon: float, p: int) -> str:
    # Bucket to 1° to massively reduce Open-Meteo calls.
    return f"w:{round(lat)}:{round(lon)}:{p}"


async def _get_weather(client: httpx.AsyncClient, lat: float, lon: float, p: int) -> WeatherSample | None:
    key = _weather_grid_key(lat, lon, p)
    cached = _cached(key, WEATHER_TTL)
    if cached is not None:
        return cached  # type: ignore[return-value]
    w = await fetch_weather_at(client, round(lat), round(lon), p)
    if w is not None:
        _store(key, w)
    return w


async def _enrich(flights: list[Flight]) -> list[dict]:
    out: list[dict] = []
    sem = asyncio.Semaphore(8)

    async with httpx.AsyncClient() as client:
        async def handle(f: Flight) -> dict:
            risk = "unknown"
            if f.alt_ft is not None and f.alt_ft > 25000:
                p = altitude_to_pressure_hpa(f.alt_ft)
                async with sem:
                    w = await _get_weather(client, f.lat, f.lon, p)
                if w is not None:
                    risk = classify(w.temp_c, w.rh_percent, p)
            elif f.alt_ft is not None and f.alt_ft <= 25000:
                risk = "none"
            return {
                "icao24": f.icao24,
                "callsign": f.callsign,
                "country": f.origin_country,
                "lat": f.lat,
                "lon": f.lon,
                "alt_ft": round(f.alt_ft) if f.alt_ft else None,
                "heading": f.heading,
                "velocity_ms": f.velocity_ms,
                "risk": risk,
            }

        out = await asyncio.gather(*(handle(f) for f in flights))
    return out


@app.get("/api/flights")
async def flights(
    lamin: float = EUROPE_BBOX[0],
    lomin: float = EUROPE_BBOX[1],
    lamax: float = EUROPE_BBOX[2],
    lomax: float = EUROPE_BBOX[3],
):
    bbox = (lamin, lomin, lamax, lomax)
    cache_key = f"f:{bbox}"
    cached = _cached(cache_key, FLIGHTS_TTL)
    if cached is not None:
        return JSONResponse(cached)

    try:
        states = await fetch_states(bbox)
    except Exception as e:
        # Surface the real cause for debugging — httpx errors often have empty str()
        import logging
        logging.exception("OpenSky upstream failed")
        raise HTTPException(502, f"OpenSky upstream error: {type(e).__name__}: {e!r}") from e

    enriched = await _enrich(states)
    payload = {
        "count": len(enriched),
        "bbox": list(bbox),
        "flights": enriched,
    }
    _store(cache_key, payload)
    return payload


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "estuaire-contrail-map"}

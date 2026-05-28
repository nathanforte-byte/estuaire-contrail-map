"""OpenSky Network ADS-B fetcher.

Free REST endpoint /states/all returns all states currently tracked.
Anonymous: ~400 calls/day, 10s min interval. With account: 4000/day, 5s interval.
Docs: https://openskynetwork.github.io/opensky-api/rest.html
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable

import httpx

OPENSKY_BASE = "https://opensky-network.org/api"

# Europe bounding box (lamin, lomin, lamax, lomax)
EUROPE_BBOX = (35.0, -12.0, 60.0, 30.0)


@dataclass(slots=True)
class Flight:
    icao24: str
    callsign: str | None
    origin_country: str
    lon: float
    lat: float
    alt_m: float | None       # geometric altitude (m)
    velocity_ms: float | None
    heading: float | None
    on_ground: bool

    @property
    def alt_ft(self) -> float | None:
        return self.alt_m * 3.28084 if self.alt_m is not None else None


def _parse_state(s: list) -> Flight | None:
    # index map per OpenSky docs
    try:
        lon, lat = s[5], s[6]
        if lon is None or lat is None:
            return None
        return Flight(
            icao24=s[0],
            callsign=(s[1] or "").strip() or None,
            origin_country=s[2] or "",
            lon=float(lon),
            lat=float(lat),
            alt_m=float(s[13]) if s[13] is not None else (float(s[7]) if s[7] is not None else None),
            velocity_ms=float(s[9]) if s[9] is not None else None,
            heading=float(s[10]) if s[10] is not None else None,
            on_ground=bool(s[8]),
        )
    except (IndexError, TypeError, ValueError):
        return None


async def fetch_states(bbox: tuple[float, float, float, float] = EUROPE_BBOX) -> list[Flight]:
    """Fetch live states inside a bbox. Returns airborne flights only."""
    lamin, lomin, lamax, lomax = bbox
    params = {"lamin": lamin, "lomin": lomin, "lamax": lamax, "lomax": lomax}

    auth = None
    user = os.getenv("OPENSKY_USER")
    pwd = os.getenv("OPENSKY_PASS")
    if user and pwd:
        auth = (user, pwd)

    async with httpx.AsyncClient(timeout=30.0, auth=auth) as client:
        r = await client.get(f"{OPENSKY_BASE}/states/all", params=params)
        r.raise_for_status()
        data = r.json()

    states: Iterable[list] = data.get("states") or []
    flights: list[Flight] = []
    for s in states:
        f = _parse_state(s)
        if f is None or f.on_ground:
            continue
        flights.append(f)
    return flights

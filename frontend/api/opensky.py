"""OpenSky Network ADS-B fetcher.

Auth: OAuth2 client_credentials (Basic Auth was retired). Tokens last 30 min,
we cache and proactively refresh 30 s before expiry.

Anonymous: 400 credits/day. Authenticated: 4000/day. One /states/all call on
the Europe bbox costs 4 credits (>400 sq°), so authenticated buys us ~1000
calls/day → 1 call/86 s. Keep the cache aligned with that budget.

Docs: https://openskynetwork.github.io/opensky-api/rest.html
"""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Iterable

import httpx

OPENSKY_BASE = "https://opensky-network.org/api"
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
)

# Europe bounding box (lamin, lomin, lamax, lomax)
EUROPE_BBOX = (35.0, -12.0, 60.0, 30.0)

# Proactively refresh the token this many seconds before it expires.
_TOKEN_MARGIN_S = 30


@dataclass
class Flight:
    icao24: str
    callsign: str | None
    origin_country: str
    lon: float
    lat: float
    alt_m: float | None
    velocity_ms: float | None
    heading: float | None
    on_ground: bool

    @property
    def alt_ft(self) -> float | None:
        return self.alt_m * 3.28084 if self.alt_m is not None else None


class _TokenCache:
    def __init__(self) -> None:
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get(self, client: httpx.AsyncClient) -> str | None:
        cid = os.getenv("OPENSKY_CLIENT_ID")
        csec = os.getenv("OPENSKY_CLIENT_SECRET")
        if not cid or not csec:
            return None  # anonymous mode

        if self._token and time.time() < self._expires_at:
            return self._token

        async with self._lock:
            if self._token and time.time() < self._expires_at:
                return self._token
            r = await client.post(
                OPENSKY_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": cid,
                    "client_secret": csec,
                },
                timeout=15.0,
            )
            r.raise_for_status()
            data = r.json()
            self._token = data["access_token"]
            expires_in = int(data.get("expires_in", 1800))
            self._expires_at = time.time() + max(expires_in - _TOKEN_MARGIN_S, 60)
            return self._token


_tokens = _TokenCache()


def _parse_state(s: list) -> Flight | None:
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

    async with httpx.AsyncClient(timeout=30.0) as client:
        headers: dict[str, str] = {}
        token = await _tokens.get(client)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        r = await client.get(f"{OPENSKY_BASE}/states/all", params=params, headers=headers)
        if r.status_code == 401 and token:
            # Token might have just expired; force a refresh and retry once.
            _tokens._expires_at = 0.0
            token = await _tokens.get(client)
            if token:
                headers["Authorization"] = f"Bearer {token}"
                r = await client.get(f"{OPENSKY_BASE}/states/all", params=params, headers=headers)
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

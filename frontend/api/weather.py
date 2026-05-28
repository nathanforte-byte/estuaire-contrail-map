"""Upper-air weather via Open-Meteo (free, no auth).

We need temperature and relative humidity at the flight's pressure level
to evaluate the Schmidt-Appleman criterion and ISSR.

Open-Meteo exposes pressure levels: 1000, 925, 850, 700, 500, 300, 250, 200 hPa.
Cruise is roughly 250-300 hPa. We pick the closest level to the flight altitude.

Docs: https://open-meteo.com/en/docs (variables temperature_XXXhPa, relative_humidity_XXXhPa)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

PRESSURE_LEVELS_HPA = [1000, 925, 850, 700, 500, 300, 250, 200]


@dataclass
class WeatherSample:
    temp_c: float
    rh_percent: float
    pressure_hpa: int


def altitude_to_pressure_hpa(alt_ft: float) -> int:
    """Pick the closest Open-Meteo pressure level for a given altitude in feet.

    Standard atmosphere approximation (rough but fine for level selection):
      FL000 ~ 1013 hPa, FL100 ~ 697, FL200 ~ 466, FL300 ~ 301, FL350 ~ 238, FL400 ~ 187.
    """
    alt_m = alt_ft * 0.3048
    # Barometric formula (troposphere, T0=288.15K, L=0.0065 K/m, p0=1013.25)
    p = 1013.25 * (1 - 2.25577e-5 * alt_m) ** 5.25588
    return min(PRESSURE_LEVELS_HPA, key=lambda x: abs(x - p))


async def fetch_weather_at(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    pressure_hpa: int,
) -> WeatherSample | None:
    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "hourly": f"temperature_{pressure_hpa}hPa,relative_humidity_{pressure_hpa}hPa",
        "forecast_days": 1,
        "timezone": "UTC",
    }
    try:
        r = await client.get(OPEN_METEO_URL, params=params, timeout=15.0)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return None

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get(f"temperature_{pressure_hpa}hPa") or []
    rhs = hourly.get(f"relative_humidity_{pressure_hpa}hPa") or []
    if not times or not temps or not rhs:
        return None

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    try:
        idx = times.index(now_iso)
    except ValueError:
        idx = 0

    t, rh = temps[idx], rhs[idx]
    if t is None or rh is None:
        return None
    return WeatherSample(temp_c=float(t), rh_percent=float(rh), pressure_hpa=pressure_hpa)

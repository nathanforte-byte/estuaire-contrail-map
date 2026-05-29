"""Satellite validation: pull Meteosat tiles centred on persistent-contrail flights.

Reads the latest enriched snapshot from `opensky_latest.payload`, picks flights
classified "persistent", spatially clusters them (one ~900 km satellite tile can
cover many flights at once), and fetches the matching Meteosat IR + microphysics
RGB from the public EUMETSAT View Service.

Public WMS — no auth needed. Use this to spot-check whether the model's
predicted contrails actually appear on satellite.

Run:
    python satellite_validate.py --out-dir satellite_snaps/

Hits the public /api/flights endpoint of the deployed Vercel app — no auth.
"""
from __future__ import annotations

import argparse
import asyncio
import os
from datetime import datetime
from pathlib import Path

import httpx


ESTUAIRE_API = os.environ.get(
    "ESTUAIRE_API",
    "https://estuaire-contrail-map.vercel.app/api/flights",
)

EUMETSAT_WMS = "https://view.eumetsat.int/geoserver/wms"
GIBS_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"


def route(lon: float, mode: str) -> tuple[str, str]:
    if -150 <= lon <= -20:
        prefix = "GOES-East_ABI"
        return ("gibs", {
            "color": f"{prefix}_GeoColor",
            "ir": f"{prefix}_Band13_Clean_Infrared",
            "contrails": f"{prefix}_Band13_Clean_Infrared",  # GIBS pas de RGB microphysics
        }[mode])
    if lon >= 80 or lon <= -150:
        prefix = "Himawari_AHI"
        return ("gibs", {
            "color": f"{prefix}_GeoColor",
            "ir": f"{prefix}_Band13_Clean_Infrared",
            "contrails": f"{prefix}_Band13_Clean_Infrared",
        }[mode])
    return ("eumetsat", {
        "color": "msg_fes:rgb_naturalenhncd",
        "ir": "msg_fes:ir108",
        "contrails": "msg_fes:rgb_microphysics",
    }[mode])


def snap_to_10min(dt: datetime) -> datetime:
    return dt.replace(minute=(dt.minute // 10) * 10, second=0, microsecond=0)


def cluster_flights(flights: list[dict], grid_deg: float = 5.0) -> dict[tuple[int, int], list[dict]]:
    """Group flights into satellite-tile-sized buckets so we don't re-fetch
    the same scene per flight. grid_deg=5 → ~550 km cells (fits inside an 8°
    span tile with margin)."""
    buckets: dict[tuple[int, int], list[dict]] = {}
    for f in flights:
        key = (
            int(round(f["lat"] / grid_deg)),
            int(round(f["lon"] / grid_deg)),
        )
        buckets.setdefault(key, []).append(f)
    return buckets


async def fetch_snapshot(client: httpx.AsyncClient) -> tuple[datetime, list[dict]]:
    r = await client.get(ESTUAIRE_API, timeout=20.0)
    r.raise_for_status()
    payload = r.json()
    fetched_at_raw = payload.get("fetched_at")
    if not fetched_at_raw:
        raise RuntimeError("Pas de fetched_at dans la réponse API.")
    fetched_at = datetime.fromisoformat(fetched_at_raw.replace("Z", "+00:00"))
    return fetched_at, payload.get("flights", [])


async def fetch_tile(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
    when: datetime,
    mode: str,
    span_deg: float = 4.0,
    size: int = 1024,
) -> bytes:
    provider, layer = route(lon, mode)
    time_str = snap_to_10min(when).strftime("%Y-%m-%dT%H:%M:%SZ")
    bbox = f"{lat - span_deg},{lon - span_deg},{lat + span_deg},{lon + span_deg}"

    if provider == "gibs":
        params = {
            "REQUEST": "GetSnapshot", "LAYERS": layer, "CRS": "EPSG:4326",
            "TIME": time_str, "BBOX": bbox, "FORMAT": "image/png",
            "WIDTH": size, "HEIGHT": size,
        }
        r = await client.get(GIBS_URL, params=params, timeout=60.0)
    else:
        params = {
            "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
            "LAYERS": layer, "CRS": "EPSG:4326", "TIME": time_str,
            "BBOX": bbox, "FORMAT": "image/png",
            "WIDTH": size, "HEIGHT": size, "TRANSPARENT": "true",
        }
        r = await client.get(EUMETSAT_WMS, params=params, timeout=60.0)
    r.raise_for_status()
    if not r.content.startswith(b"\x89PNG"):
        raise RuntimeError(f"Non-PNG: {r.content[:200]!r}")
    return r.content


async def run(out_dir: Path, mode: str, max_clusters: int | None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient() as client:
        fetched_at, flights = await fetch_snapshot(client)
        print(f"snapshot @ {fetched_at.isoformat()}  total flights: {len(flights)}")

        persistent = [f for f in flights if f.get("risk") == "persistent"]
        print(f"persistent contrails:               {len(persistent)}")

        if not persistent:
            print("→ rien à valider.")
            return

        buckets = cluster_flights(persistent, grid_deg=5.0)
        print(f"satellite tiles requis (dédup 5°):  {len(buckets)}")

        bucket_items = list(buckets.items())
        if max_clusters is not None:
            bucket_items = bucket_items[:max_clusters]
            print(f"limité à {max_clusters} tiles (--max-clusters)")

        sem = asyncio.Semaphore(4)
        ok, fail = 0, 0
        errors: list[str] = []

        async def one(key: tuple[int, int], group: list[dict]):
            nonlocal ok, fail
            # Centre = barycentre des vols du cluster.
            lat_c = sum(f["lat"] for f in group) / len(group)
            lon_c = sum(f["lon"] for f in group) / len(group)
            callsigns = ",".join(sorted({(f.get("callsign") or "?").strip() for f in group})[:5])
            stem = f"{fetched_at.strftime('%Y%m%dT%H%M')}_{key[0]:+03d}_{key[1]:+04d}_n{len(group)}"
            out_path = out_dir / f"{stem}_{mode}.png"
            async with sem:
                try:
                    png = await fetch_tile(client, lat_c, lon_c, fetched_at, mode)
                except Exception as e:
                    fail += 1
                    errors.append(f"{stem}: {type(e).__name__}: {e}")
                    return
            out_path.write_bytes(png)
            ok += 1
            print(f"  ✓ {out_path.name}  centre=({lat_c:.1f},{lon_c:.1f})  vols={len(group)}  [{callsigns}]")

        await asyncio.gather(*(one(k, g) for k, g in bucket_items))

        total = ok + fail
        rate = ok / total if total else 0.0
        print(f"\nrésultat: {ok}/{total} ({rate:.0%}) — dossier: {out_dir}")
        if rate < 0.8 and errors:
            print("échantillon d'erreurs:")
            for e in errors[:5]:
                print(f"  - {e}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", type=Path, default=Path("satellite_snaps"))
    p.add_argument(
        "--mode",
        choices=["ir", "color", "contrails"],
        default="contrails",
        help="contrails = RGB microphysics Meteosat (recommandé)",
    )
    p.add_argument("--max-clusters", type=int, default=None,
                   help="Limiter le nombre de tiles téléchargés (test).")
    args = p.parse_args()
    asyncio.run(run(args.out_dir, args.mode, args.max_clusters))


if __name__ == "__main__":
    main()

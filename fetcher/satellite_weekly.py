"""Cherry-pick high-res satellite images of European contrail hotspots over the
last N days. Designed for mailing/marketing use: one striking image per send.

Uses NASA GIBS Worldview Snapshots — public, no auth, daily archives.
Satellites: VIIRS NOAA-20 (~375 m) or MODIS Terra/Aqua (~250 m).

Run:
    python satellite_weekly.py --days 7 --out-dir ~/Downloads/estuaire_week
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx


GIBS_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"

# Couloirs aériens européens densément fréquentés.
HOTSPOTS: list[dict] = [
    {"name": "uk_channel", "lat": 50.7, "lon": 0.0,
     "desc": "Manche / sud Angleterre — routes transatlantiques arrivant sur Heathrow"},
    {"name": "bay_biscay", "lat": 45.4, "lon": -5.0,
     "desc": "Golfe de Gascogne — sortie ouest depuis l'Europe vers Amérique du Nord"},
    {"name": "po_alps", "lat": 45.5, "lon": 10.5,
     "desc": "Po Valley / sud Alpes — souvent ciel clair, croisement N-S et E-W"},
]

LAYERS = {
    "viirs_n20": "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    "viirs_snpp": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    "modis_terra": "MODIS_Terra_CorrectedReflectance_TrueColor",
    "modis_aqua": "MODIS_Aqua_CorrectedReflectance_TrueColor",
}


async def fetch_day(
    client: httpx.AsyncClient,
    spot: dict,
    day: date,
    layer: str,
    out_path: Path,
    span_deg: float = 4.0,
    size: int = 2048,
) -> tuple[bool, str]:
    bbox = (
        f"{spot['lat'] - span_deg},{spot['lon'] - span_deg},"
        f"{spot['lat'] + span_deg},{spot['lon'] + span_deg}"
    )
    params = {
        "REQUEST": "GetSnapshot",
        "LAYERS": LAYERS[layer],
        "CRS": "EPSG:4326",
        "TIME": day.isoformat(),
        "BBOX": bbox,
        "FORMAT": "image/png",
        "WIDTH": size,
        "HEIGHT": size,
    }
    try:
        r = await client.get(GIBS_URL, params=params, timeout=90.0)
        r.raise_for_status()
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"
    if not r.content.startswith(b"\x89PNG"):
        return False, f"non-PNG ({len(r.content)}B): {r.content[:120]!r}"
    out_path.write_bytes(r.content)
    return True, f"{len(r.content) / 1024:.0f} KB"


async def run(out_dir: Path, days: int, layer: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date()

    targets: list[tuple[dict, date]] = []
    for d in range(1, days + 1):
        day = today - timedelta(days=d)
        for spot in HOTSPOTS:
            targets.append((spot, day))

    print(f"satellite: {layer}  ({LAYERS[layer]})")
    print(f"zones: {len(HOTSPOTS)}, jours: {days}, total: {len(targets)} images")
    print(f"out:   {out_dir}\n")

    sem = asyncio.Semaphore(4)
    ok, fail = 0, 0
    errors: list[str] = []

    async with httpx.AsyncClient() as client:
        async def one(spot: dict, day: date):
            nonlocal ok, fail
            fname = f"{day.isoformat()}_{spot['name']}_{layer}.png"
            out = out_dir / fname
            if out.exists() and out.stat().st_size > 1000:
                print(f"  · skip   {fname}")
                ok += 1
                return
            async with sem:
                success, info = await fetch_day(client, spot, day, layer, out)
            if success:
                ok += 1
                print(f"  ✓ {fname}  ({info})")
            else:
                fail += 1
                errors.append(f"{fname}: {info}")

        await asyncio.gather(*(one(s, d) for s, d in targets))

    total = ok + fail
    rate = ok / total if total else 0.0
    print(f"\n{ok}/{total} ({rate:.0%}) — {out_dir}")
    if rate < 0.8 and errors:
        print("erreurs:")
        for e in errors[:6]:
            print(f"  - {e}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=7)
    p.add_argument(
        "--layer",
        choices=list(LAYERS),
        default="viirs_n20",
        help="viirs_n20 = 375m (recommandé), modis_terra = 250m",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=Path.home() / "Downloads" / "estuaire_week",
    )
    args = p.parse_args()
    asyncio.run(run(args.out_dir, args.days, args.layer))


if __name__ == "__main__":
    main()

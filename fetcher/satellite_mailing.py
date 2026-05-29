"""All-in-one: pull VIIRS true-color tile for a known European hotspot + overlay
Estuaire flight tracks at that day's satellite pass. Output is a ready-to-send
mailing image.

Usage:
    SUPABASE_ANON_KEY=... python satellite_mailing.py --date 2026-06-03 --zone po_alps

Zones disponibles: uk_channel, bay_biscay, po_alps (cf. satellite_weekly.py).
Le pass VIIRS NOAA-20 sur l'Europe centrale tombe à ~12:30 UTC chaque jour.
On overlay les vols cruise (>25000 ft) des 2h précédentes, qui ont le plus
de chances d'avoir laissé les contrails visibles sur l'image.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont


GIBS_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
SUPABASE_URL = "https://qeracszwzpkellfqjbgk.supabase.co"

ZONES: dict[str, dict] = {
    "uk_channel": {"lat": 50.7, "lon": 0.0,
                   "desc": "Manche / sud Angleterre — routes transatlantiques arrivant sur Heathrow"},
    "bay_biscay": {"lat": 45.4, "lon": -5.0,
                   "desc": "Golfe de Gascogne — sortie ouest depuis l'Europe vers Amérique du Nord"},
    "po_alps": {"lat": 45.5, "lon": 10.5,
                "desc": "Po Valley / sud Alpes — souvent ciel clair, croisement N-S et E-W"},
}

# VIIRS NOAA-20 descendant pass over Europe central: ~12:30 UTC.
# Contrails persistent : on regarde 2h en arrière.
VIIRS_PASS_UTC = time(12, 30)
LOOKBACK_MIN = 120


def latlon_to_xy(lat, lon, bbox, size):
    lat_min, lon_min, lat_max, lon_max = bbox
    w, h = size
    x = (lon - lon_min) / (lon_max - lon_min) * w
    y = (lat_max - lat) / (lat_max - lat_min) * h
    return x, y


async def fetch_viirs(zone: dict, day: date, out_path: Path, span_deg: float = 4.0, size: int = 2048) -> tuple[float, float, float, float]:
    bbox = (zone["lat"] - span_deg, zone["lon"] - span_deg,
            zone["lat"] + span_deg, zone["lon"] + span_deg)
    params = {
        "REQUEST": "GetSnapshot",
        "LAYERS": "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        "CRS": "EPSG:4326",
        "TIME": day.isoformat(),
        "BBOX": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        "FORMAT": "image/png",
        "WIDTH": size, "HEIGHT": size,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.get(GIBS_URL, params=params)
        r.raise_for_status()
    if not r.content.startswith(b"\x89PNG"):
        raise RuntimeError(f"VIIRS non-PNG: {r.content[:200]!r}")
    out_path.write_bytes(r.content)
    return bbox


async def fetch_positions(bbox, t_from: datetime, t_to: datetime, min_alt_ft: int = 25000) -> list[dict]:
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not key:
        raise SystemExit("SUPABASE_ANON_KEY manquant dans l'env.")
    lat_min, lon_min, lat_max, lon_max = bbox
    params = [
        ("ts", f"gte.{t_from.isoformat().replace('+00:00', 'Z')}"),
        ("ts", f"lte.{t_to.isoformat().replace('+00:00', 'Z')}"),
        ("lat", f"gte.{lat_min}"), ("lat", f"lte.{lat_max}"),
        ("lon", f"gte.{lon_min}"), ("lon", f"lte.{lon_max}"),
        ("alt_ft", f"gte.{min_alt_ft}"),
        ("select", "icao24,callsign,ts,lat,lon,alt_ft"),
        ("order", "icao24,ts"),
        ("limit", "20000"),
    ]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/flight_positions",
                             params=params, headers=headers)
        r.raise_for_status()
        return r.json()


def render(img_path: Path, rows: list[dict], bbox, t_img: datetime, zone_name: str) -> Image.Image:
    img = Image.open(img_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
        font_sm = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
    except OSError:
        font = font_sm = ImageFont.load_default()

    by_icao: dict[str, list[dict]] = {}
    for r in rows:
        by_icao.setdefault(r["icao24"], []).append(r)

    drawn = 0
    for icao, pts in by_icao.items():
        pts = sorted(pts, key=lambda r: r["ts"])
        if len(pts) < 2:
            continue
        xys = [latlon_to_xy(p["lat"], p["lon"], bbox, img.size) for p in pts]
        for (x1, y1), (x2, y2) in zip(xys, xys[1:]):
            draw.line([(x1, y1), (x2, y2)], fill=(255, 220, 0, 235), width=3)
        x_end, y_end = xys[-1]
        rad = 7
        draw.ellipse([x_end - rad, y_end - rad, x_end + rad, y_end + rad],
                     outline=(255, 255, 255, 255), fill=(255, 80, 0, 255), width=2)
        cs = (pts[-1].get("callsign") or icao).strip()
        if cs:
            draw.text((x_end + 10, y_end - 12), cs, font=font_sm, fill=(255, 255, 255, 255))
        drawn += 1

    legend_h = 90
    legend = Image.new("RGBA", (img.size[0], legend_h), (0, 0, 0, 200))
    ld = ImageDraw.Draw(legend)
    ld.text((20, 12), f"Estuaire — {ZONES[zone_name]['desc']}", font=font, fill=(255, 255, 255, 255))
    ld.text((20, 42), f"{drawn} vols cruise overlayés · VIIRS NOAA-20 · {t_img.date().isoformat()}",
            font=font_sm, fill=(220, 220, 220, 255))
    ld.text((20, 62), "Jaune = trajectoire 2h avant pass satellite · Orange = position au pass",
            font=font_sm, fill=(220, 220, 220, 255))

    out = Image.alpha_composite(img, overlay)
    out.paste(legend, (0, out.size[1] - legend_h), legend)
    return out.convert("RGB")


async def run(args):
    if args.zone not in ZONES:
        raise SystemExit(f"--zone doit être un de: {', '.join(ZONES)}")
    zone = ZONES[args.zone]
    day = date.fromisoformat(args.date) if args.date else (datetime.now(timezone.utc).date() - timedelta(days=1))
    t_img = datetime.combine(day, VIIRS_PASS_UTC, tzinfo=timezone.utc)
    t_from = t_img - timedelta(minutes=LOOKBACK_MIN)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    img_path = args.out_dir / f"{day.isoformat()}_{args.zone}_viirs.png"
    final_path = args.out_dir / f"{day.isoformat()}_{args.zone}_mailing.png"

    print(f"zone:       {args.zone} — {zone['desc']}")
    print(f"date:       {day.isoformat()}  pass VIIRS ~12:30 UTC")
    print(f"positions:  {t_from.strftime('%H:%M')} → {t_img.strftime('%H:%M')} UTC")
    print()

    if img_path.exists() and img_path.stat().st_size > 1000:
        print(f"[1/3] image VIIRS déjà en cache: {img_path.name}")
        bbox = (zone["lat"] - 4.0, zone["lon"] - 4.0, zone["lat"] + 4.0, zone["lon"] + 4.0)
    else:
        print(f"[1/3] fetch VIIRS NASA GIBS…")
        bbox = await fetch_viirs(zone, day, img_path)
        print(f"      → {img_path.name} ({img_path.stat().st_size // 1024} KB)")

    print(f"[2/3] fetch positions Supabase…")
    rows = await fetch_positions(bbox, t_from, t_img)
    n_unique = len({r["icao24"] for r in rows})
    n_tracks = sum(1 for icao, pts in
                   {r["icao24"]: [r2 for r2 in rows if r2["icao24"] == r["icao24"]]
                    for r in rows}.items() if len(pts) >= 2)
    print(f"      → {len(rows)} positions, {n_unique} vols uniques")

    print(f"[3/3] overlay…")
    out = render(img_path, rows, bbox, t_img, args.zone)
    out.save(final_path, quality=90)
    print(f"\n✓ mailing prêt: {final_path}")
    if n_unique < 10:
        print(f"⚠️  Seulement {n_unique} vols dans la fenêtre — la table flight_positions")
        print("    est peut-être encore en train de se remplir. Réessaie quand tu auras")
        print("    plusieurs jours d'historique.")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--zone", choices=list(ZONES), default="po_alps")
    p.add_argument("--date", type=str, default=None,
                   help="YYYY-MM-DD (UTC). Défaut: hier.")
    p.add_argument("--out-dir", type=Path,
                   default=Path.home() / "Downloads" / "estuaire_mailing")
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()

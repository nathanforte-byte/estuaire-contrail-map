"""Overlay flight tracks (from Supabase flight_positions) onto a satellite image.

Reads the bbox + timestamp from the source image's expected geometry,
queries persistent flight positions in that window, draws coloured tracks
with callsign labels.

The satellite image is assumed equirectangular (EPSG:4326) — both EUMETSAT
WMS and NASA GIBS Worldview Snapshots return that when CRS=EPSG:4326 is
requested, which is what our `satellite_validate.py` / `_weekly.py` do.

Run example:
    python satellite_overlay.py \\
        --image ~/Downloads/estuaire_uk_ir.png \\
        --bbox 46.7,-4.0,54.7,4.0 \\
        --time 2026-05-29T07:30:00Z \\
        --window-min 120 \\
        --out ~/Downloads/estuaire_uk_ir_overlay.png
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont


SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://qeracszwzpkellfqjbgk.supabase.co"
).rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]


def latlon_to_xy(
    lat: float,
    lon: float,
    bbox: tuple[float, float, float, float],
    size: tuple[int, int],
) -> tuple[float, float]:
    lat_min, lon_min, lat_max, lon_max = bbox
    w, h = size
    x = (lon - lon_min) / (lon_max - lon_min) * w
    y = (lat_max - lat) / (lat_max - lat_min) * h
    return x, y


async def fetch_positions(
    bbox: tuple[float, float, float, float],
    t_from: datetime,
    t_to: datetime,
    min_alt_ft: int = 25000,
) -> list[dict]:
    lat_min, lon_min, lat_max, lon_max = bbox
    params = {
        "ts": f"gte.{t_from.isoformat().replace('+00:00', 'Z')}",
        "select": "icao24,callsign,ts,lat,lon,alt_ft",
        "order": "icao24,ts",
        "lat": f"gte.{lat_min}",
        "lon": f"gte.{lon_min}",
        "alt_ft": f"gte.{min_alt_ft}",
        "limit": "10000",
    }
    # PostgREST: chain multiple constraints on same column via "and" filter.
    # We need both lat>=min and lat<=max, lon>=min and lon<=max, ts<=max → use
    # the "and=" syntax. Simpler path: pass each constraint as a distinct param
    # with the column repeated — httpx supports this via list values.
    multi = [
        ("ts", f"gte.{t_from.isoformat().replace('+00:00', 'Z')}"),
        ("ts", f"lte.{t_to.isoformat().replace('+00:00', 'Z')}"),
        ("lat", f"gte.{lat_min}"),
        ("lat", f"lte.{lat_max}"),
        ("lon", f"gte.{lon_min}"),
        ("lon", f"lte.{lon_max}"),
        ("alt_ft", f"gte.{min_alt_ft}"),
        ("select", "icao24,callsign,ts,lat,lon,alt_ft"),
        ("order", "icao24,ts"),
        ("limit", "10000"),
    ]
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/flight_positions",
            params=multi,
            headers=headers,
        )
        r.raise_for_status()
        return r.json()


def group_tracks(rows: list[dict]) -> dict[str, list[dict]]:
    by_icao: dict[str, list[dict]] = {}
    for r in rows:
        by_icao.setdefault(r["icao24"], []).append(r)
    return {k: sorted(v, key=lambda r: r["ts"]) for k, v in by_icao.items()}


def render(
    img: Image.Image,
    tracks: dict[str, list[dict]],
    bbox: tuple[float, float, float, float],
) -> Image.Image:
    out = img.convert("RGBA").copy()
    overlay = Image.new("RGBA", out.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
    except OSError:
        font = ImageFont.load_default()

    drawn = 0
    for icao, pts in tracks.items():
        if len(pts) < 2:
            continue
        xys = [latlon_to_xy(p["lat"], p["lon"], bbox, out.size) for p in pts]
        # ligne semi-transparente jaune
        for (x1, y1), (x2, y2) in zip(xys, xys[1:]):
            draw.line([(x1, y1), (x2, y2)], fill=(255, 220, 0, 220), width=2)
        # marqueur position la plus récente
        x_end, y_end = xys[-1]
        r = 5
        draw.ellipse(
            [x_end - r, y_end - r, x_end + r, y_end + r],
            outline=(255, 255, 255, 255),
            fill=(255, 80, 0, 255),
            width=2,
        )
        # callsign
        cs = (pts[-1].get("callsign") or icao).strip()
        if cs:
            draw.text((x_end + 7, y_end - 8), cs, font=font, fill=(255, 255, 255, 255))
        drawn += 1

    # Légende
    legend_h = 50
    legend = Image.new("RGBA", (out.size[0], legend_h), (0, 0, 0, 180))
    ld = ImageDraw.Draw(legend)
    ld.text(
        (10, 8),
        f"Estuaire — {drawn} vols en croisière (>25000 ft) overlayés",
        font=font,
        fill=(255, 255, 255, 255),
    )
    ld.text(
        (10, 28),
        "Jaune = trajectoire ces 2 dernières heures · Orange = position actuelle",
        font=font,
        fill=(255, 255, 255, 255),
    )

    out = Image.alpha_composite(out, overlay)
    out.paste(legend, (0, out.size[1] - legend_h), legend)
    return out


def main():
    import asyncio

    p = argparse.ArgumentParser()
    p.add_argument("--image", type=Path, required=True)
    p.add_argument(
        "--bbox",
        type=str,
        required=True,
        help="lat_min,lon_min,lat_max,lon_max — la bbox que tu as demandée au WMS",
    )
    p.add_argument(
        "--time",
        type=str,
        required=True,
        help="Timestamp UTC de l'image (ISO 8601 avec Z)",
    )
    p.add_argument(
        "--window-min",
        type=int,
        default=120,
        help="Fenêtre rétrospective en minutes (par défaut 2h)",
    )
    p.add_argument("--min-alt", type=int, default=25000)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    bbox_parts = [float(x) for x in args.bbox.split(",")]
    if len(bbox_parts) != 4:
        raise SystemExit("--bbox attend 4 floats séparés par ','")
    bbox = (bbox_parts[0], bbox_parts[1], bbox_parts[2], bbox_parts[3])

    t_img = datetime.fromisoformat(args.time.replace("Z", "+00:00"))
    t_from = t_img - timedelta(minutes=args.window_min)

    print(f"image:  {args.image}")
    print(f"bbox:   {bbox}")
    print(f"window: {t_from.isoformat()} → {t_img.isoformat()}")

    rows = asyncio.run(fetch_positions(bbox, t_from, t_img, args.min_alt))
    print(f"positions ramenées: {len(rows)}")
    tracks = group_tracks(rows)
    multi = {k: v for k, v in tracks.items() if len(v) >= 2}
    print(f"vols uniques: {len(tracks)}  avec ≥2 points: {len(multi)}")

    img = Image.open(args.image)
    out = render(img, tracks, bbox)
    out.convert("RGB").save(args.out)
    print(f"✓ écrit: {args.out}")


if __name__ == "__main__":
    main()

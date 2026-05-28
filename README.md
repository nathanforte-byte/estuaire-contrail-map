# Estuaire — Live Contrail Map

Carte temps-quasi-réel des vols formant des traînées de condensation persistantes au-dessus de l'Europe. Lead magnet B2B pour Estuaire.

**Live →** https://estuaire-contrail-map.vercel.app

## Pitch
- Top of funnel : carte virale, embed-able, presse + LinkedIn
- Gate : "alertes pour ta flotte" → capture lead pro
- Différenciation : tout le monde montre les avions (Flightradar), personne ne montre quels vols créent des **traînées persistantes** (≈ 50 % du forçage radiatif aviation)

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Actions cron (every 5 min)                               │
│   .github/workflows/fetch-opensky.yml                            │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │ matrix of 5 parallel runners (Azure egress)            │    │
│   │  → fetcher/fetch_to_supabase.py                        │    │
│   │      1. OAuth2 OpenSky                                 │    │
│   │      2. GET /states/all (Europe bbox)                  │    │
│   │      3. Open-Meteo for each grid (lat°, lon°, hPa)     │    │
│   │      4. Schmidt-Appleman + RH/ice → classify           │    │
│   │      5. UPSERT into Supabase opensky_latest            │    │
│   └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              Supabase  qeracszwzpkellfqjbgk.supabase.co
              table  opensky_latest  (single row keyed by bbox)
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel function  frontend/api/index.py                          │
│   GET /api/flights → SELECT latest snapshot from Supabase        │
│   GET /api/health  → liveness                                    │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              Static  frontend/index.html  (MapLibre GL, dark theme)
              polls /api/flights every 15s
```

### Why this architecture
OpenSky's REST API is hosted at ETH Zurich and **blacklists every major cloud egress range** (GCP, AWS-East, Cloudflare all confirmed: TCP SYN never gets a SYN-ACK). The only reliable free egress we found is **Azure**, used by GitHub Actions runners. Even there, hit rate is ~33 % per runner IP, so we race 5 parallel attempts each cron.

Once data is in Supabase, every consumer (Vercel function, future dashboards, embed widgets) is a plain Postgres read — no upstream dependency, no rate-limit risk, no IP-block surprises.

## Repo layout

```
estuaire/
├── .github/workflows/
│   └── fetch-opensky.yml      # cron every 5 min, matrix-of-5
├── db/
│   └── opensky_latest.sql     # schema (run via Management API)
├── fetcher/
│   ├── fetch_to_supabase.py   # the cron job's payload
│   └── requirements.txt
└── frontend/                  # Vercel project root
    ├── index.html             # MapLibre map
    ├── api/
    │   ├── index.py           # FastAPI: /api/flights, /api/health
    │   ├── opensky.py         # (still imported by fetcher via sys.path)
    │   ├── weather.py
    │   └── contrail.py        # Schmidt-Appleman + RH/ice classifier
    ├── requirements.txt
    └── vercel.json
```

## Contrail model (simplified)
Schmidt-Appleman criterion (SAC):
- **Formation** possible if `T_amb < T_SAC` (≈ -40 °C at FL340 / 250 hPa)
- **Persistence** requires `RH_ice ≥ 100 %` (ice-supersaturated region, ISSR)

Output buckets per flight:
- `none` — no formation (warm air or low altitude)
- `short` — forms but evaporates quickly
- `persistent` — ISSR, the climatically relevant case (the hero signal on the map)

v1+ will integrate aircraft type (engine efficiency η, EI water vapour) and the full CoCiP-like model.

## Secrets & env

### GitHub repo secrets
- `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` — OAuth2 client
- `SUPABASE_URL` — `https://qeracszwzpkellfqjbgk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for the upsert

### Vercel env (production)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — read-only, RLS enforces SELECT-only

## Local dev
```bash
# backend (Vercel function locally)
cd frontend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SUPABASE_URL=... SUPABASE_ANON_KEY=... uvicorn api.index:app --reload --port 8000

# frontend
cd frontend && python -m http.server 5173
# → http://localhost:5173
```

## Roadmap
- v0 (shipped) ✅ Europe, ~5-min freshness, 3 risk buckets
- v0.1 — Distinguish day/night persistent contrails (night = much higher radiative forcing)
- v0.2 — Filter by airline / departure airport
- v0.3 — Lead capture form wired to Supabase + Slack notification
- v1 — Aircraft-type-aware EI factors + altitude-perturbation what-if ("what if these flights flew 2000 ft lower?")

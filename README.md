# Estuaire — Live Contrail Map

Carte temps réel des vols formant (ou risquant de former) des traînées de condensation persistantes au-dessus de l'Europe. Lead magnet B2B pour Estuaire.

## Pitch
- Top of funnel : carte virale, embed-able, presse + LinkedIn
- Gate : "alertes pour ta flotte / ta route" → capture lead pro
- Différenciation : tout le monde montre les avions (Flightradar), personne ne montre quels vols créent des **traînées persistantes** (50%+ du forçage radiatif aviation)

## Architecture v0
```
estuaire/
├── backend/             # FastAPI
│   ├── main.py          # Endpoint /api/flights
│   ├── opensky.py       # ADS-B (OpenSky Network)
│   ├── weather.py       # T, RH altitude (Open-Meteo, gratuit)
│   ├── contrail.py      # Schmidt-Appleman simplifié
│   └── requirements.txt
├── frontend/
│   └── index.html       # MapLibre GL, dark theme
└── .env.example
```

## Sources de données (toutes gratuites)
- **OpenSky Network** — `/states/all` endpoint REST (rate limit 400 req/jour anon, 4000 avec compte)
- **Open-Meteo** — API météo upper-air gratuite, pas d'auth, temp + humidité à n'importe quelle pression (250 hPa ≈ cruise)
- **MapLibre GL** + tuiles OSM ou MapTiler free tier

## Modèle contrail v0 (simplifié)
Schmidt-Appleman criterion (SAC) :
- Formation possible si **T_amb < T_SAC** (seuil dépendant de l'altitude, ~ -40°C à 250 hPa)
- Traînée **persistante** si **RH_ice > 100%** (ISSR — Ice Supersaturated Region)
- v0 : on classe chaque vol en 3 buckets : `none / short-lived / persistent`
- v1 : intégrer pression, type d'avion (EI factor), efficacité propulsive

## Run local
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# autre terminal
cd frontend && python -m http.server 5173
# ouvrir http://localhost:5173
```

## Deploy

### Backend → Railway
1. Push the repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo**, select this repo.
3. In service settings:
   - **Root Directory**: `backend`
   - **Watch Paths**: `backend/**`
   - Variables: `OPENSKY_USER`, `OPENSKY_PASS` (optional but recommended — raises rate limit 10×)
4. Railway auto-detects Nixpacks (Python) from `requirements.txt` and uses `railway.json` / `Procfile` for start.
5. Generate a public domain in *Settings → Networking* (e.g. `estuaire-backend.up.railway.app`).
6. Smoke test: `curl https://<your-railway-domain>/api/health`.

### Frontend → Vercel
1. Edit [frontend/vercel.json](frontend/vercel.json) — replace `REPLACE_ME.up.railway.app` with the Railway domain from step 5 above.
2. Vercel → **Add New Project → Import GitHub repo**.
3. In project settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Other (static)
   - **Build Command**: *(empty)*
   - **Output Directory**: `.`
4. Deploy. The Vercel rewrite forwards `/api/*` to Railway → no CORS, no client-side URL juggling.
5. Optional: add a custom domain (e.g. `contrails.estuaire.io`).

### After deploy — narrow CORS (optional but tidy)
With the Vercel rewrite, the browser only ever calls same-origin, so `allow_origins=["*"]` is harmless. Still, you can narrow it in [backend/main.py](backend/main.py):
```python
allow_origins=["https://contrails.estuaire.io", "https://<your-vercel>.vercel.app"]
```

## Roadmap
- v0 : Europe, snapshot toutes les 10s, 3 buckets de risque
- v0.1 : forecast 1h (où vont-ils former des traînées ?)
- v0.2 : filtre par compagnie / aéroport départ
- v0.3 : embed widget pour médias + lead capture form
- v1 : modèle physique complet (CoCiP-like), recalibrage avec données Estuaire prod

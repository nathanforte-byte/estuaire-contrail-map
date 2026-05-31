# Contrail-model upgrade roadmap

Two engineering upgrades scoped to push the rose-flight classifier from
~50-70% precision to ~80% (ECMWF-grade), without changing the user-facing
shape of the API.

Both are independent — pick either or both. Both should be applied **while
the cron is paused**, then trigger a single backfill run, then re-freeze.

---

## 1. Switch Open-Meteo → ECMWF ERA5 (Copernicus CDS)

Why: Open-Meteo's upper-air RH at 250-300 hPa has ±20-30% bias; ERA5 sits at
~10-15%. RH is the dominant error driver for ISSR detection.

### Steps

1. **Sign up for Copernicus CDS**, get an API key:
   - https://cds.climate.copernicus.eu/user/register
   - After login, copy `UID:KEY` from https://cds.climate.copernicus.eu/api-how-to
2. **Install** the client:
   ```
   pip install cdsapi
   ```
3. **Replace `frontend/api/weather.py`** with `fetcher/weather_era5.py` (new):
   - Pull `reanalysis-era5-pressure-levels` for variables `temperature`,
     `specific_humidity` at the pressure levels we use (250, 300, 500 hPa)
   - Cache results per (lat, lon, pressure_level, hour) in a tiny SQLite or
     in Supabase — ERA5 has hourly resolution and the requests are slow
     (often 30s-2min per region/hour)
4. **Switch `humidity → RH`**: ERA5 returns specific humidity `q` (kg/kg).
   Convert to RH via Tetens:
   ```
   e   = q * p / (0.622 + 0.378 * q)
   es  = 6.1078 * exp(17.27 * (T - 273.15) / (T - 35.86))
   RH  = 100 * e / es
   ```
   Then to RH/ice with the existing Magnus conversion in `contrail.py`.

### Trade-offs

- **Pro**: 2-3× more accurate humidity → much sharper ISSR detection.
- **Con**: ERA5 requests are slow + rate-limited (~10/hour soft limit on
  free tier). The fetcher must batch into one big call per Europe bbox per
  hour, instead of per-flight grid-point.
- **Workaround**: pre-fetch a 0.25° × 0.25° grid for the whole bbox once
  per cron tick, then lookup-by-position locally (in-memory dict). One ERA5
  call per cron instead of one per flight.

### Files to add / change

```
fetcher/weather_era5.py            (new)
fetcher/fetch_to_supabase.py       (swap import: weather → weather_era5)
fetcher/requirements.txt           (+cdsapi, +xarray, +netCDF4)
.github/workflows/fetch-opensky.yml (env: CDSAPI_KEY)
```

---

## 2. Per-aircraft microphysics (η, EI_H2O)

Why: The Schmidt-Appleman threshold `T_SAC` depends on the aircraft's
overall efficiency `η` (typically 0.27-0.35) and the water-vapour emission
index `EI_H2O` (1.23-1.25 for Jet A-1, ~9 for SAF). Our current model uses a
single fixed value for all aircraft, giving a ±3-5°C bias.

### Steps

1. **Download the ICAO Engine Emissions Databank (EEDB)**:
   - https://www.easa.europa.eu/en/domains/environment/icao-aircraft-engine-emissions-databank
   - Filename `edb-emissions-databank_v29c.xlsx` (or current version)
   - ~600 engine rows, columns include `Fuel Flow CO`, `NOx EI`, etc.
2. **Build a lookup `aircraft_type_code → engine_uid → η + EI_H2O`**:
   - Use `aircraft_metadata.type_code` (e.g. `A20N`, `B738`) as the join key
   - Map type_code → typical engine variant via a curated dict (LEAP-1A26
     for A20N, CFM56-7B27 for B738, etc.). ~30 codes cover 90% of European
     traffic.
   - Per engine: derive `η` from cruise SFC + thrust spec sheets, or use
     literature default 0.30 for modern turbofans, 0.27 for older.
   - `EI_H2O` is ~1.25 kg/kg for kerosene across all engines; only changes
     for SAF blends (which we'll ignore for v1).
3. **Threshold function in `contrail.py`**:
   ```python
   def t_sac(pressure_hpa, eta=0.30, ei_h2o=1.25):
       # Schmidt-Appleman + bypass-engine refinement.
       # See Schumann (1996) eq. 11.
       g = (cp_air * pressure_hpa * 100 * ei_h2o) / (eps * Q_kerosene * (1 - eta))
       # Solve T_LM where des/dT = G at the saturation curve over water.
       ...
   ```
4. **Pass `aircraft_type` to classify()** in the fetcher loop, falling back
   to the η=0.30 default when no metadata is present.

### Trade-offs

- **Pro**: removes the ±3-5°C bias on T_SAC, especially for old aircraft
  (η=0.27 → T_SAC ~4°C warmer → more false negatives) and modern neos
  (η=0.34 → T_SAC ~2°C colder).
- **Con**: maintenance burden on the type-code → engine map. Worth it for
  the top 30 codes; tail is fine on default.

### Files to add / change

```
fetcher/aircraft_efficiency.py   (new — type_code → eta table)
frontend/api/contrail.py         (t_sac signature + Schumann eq. 11)
fetcher/fetch_to_supabase.py     (pass aircraft_type to classify)
```

---

## Order of operations when ready to ship

1. Re-enable workflows: `gh workflow enable fetch-opensky.yml daily-trajectories.yml enrich-metadata.yml`
2. Apply changes (commits separately for ECMWF and microphysics)
3. Wait one full enrich cycle (~1 h) so `aircraft_metadata` covers most of
   the live fleet before the new T_SAC kicks in
4. Trigger one fetch-opensky burst to populate the new classification
5. Verify Open-Meteo / ERA5 parity on a known case (e.g. crosscheck against
   Copernicus EarthExplorer satellite contrail layer for the same hour)
6. Re-freeze if demoing

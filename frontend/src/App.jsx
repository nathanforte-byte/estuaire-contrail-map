import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Preload } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import Earth from "./components/Earth.jsx";
import Atmosphere from "./components/Atmosphere.jsx";
import Flights from "./components/Flights.jsx";
import Trajectories from "./components/Trajectories.jsx";

import HeaderPanel from "./components/HeaderPanel.jsx";
import StatsPanel from "./components/StatsPanel.jsx";
import FiltersPanel from "./components/FiltersPanel.jsx";
import GatePanel from "./components/GatePanel.jsx";

import { callsignToAirline } from "./lib/icao.js";

const API_BASE = ""; // same-origin in prod, Vite proxy in dev

function useApi(path, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const j = await r.json();
        if (!cancelled) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [path, intervalMs]);
  return { data, error };
}

export default function App() {
  const { data: snapshot } = useApi("/api/flights", 30000);
  const { data: trajectoriesData } = useApi("/api/trajectories?hours=24", 180000);

  const [filters, setFilters] = useState({
    airlines: new Set(),
    airports: new Set(),
    aircraftTypes: new Set(),
  });

  // Enrich snapshot flights with airline code.
  const flights = useMemo(() => {
    if (!snapshot?.flights) return [];
    return snapshot.flights
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({ ...f, airline: callsignToAirline(f.callsign) }));
  }, [snapshot]);

  const trajectories = useMemo(() => {
    if (!trajectoriesData?.features) return [];
    return trajectoriesData.features.map((ft) => ({
      ...ft.properties,
      airline: callsignToAirline(ft.properties.callsign),
      coords: ft.geometry.coordinates, // [[lon,lat], …]
    }));
  }, [trajectoriesData]);

  // Apply filters in-memory.
  const filteredFlights = useMemo(() => filterAll(flights, filters, false), [flights, filters]);
  const filteredTrajectories = useMemo(
    () => filterAll(trajectories, filters, true),
    [trajectories, filters],
  );

  const counts = useMemo(() => {
    const persistent = filteredFlights.filter((f) => f.risk === "persistent").length;
    return {
      total: filteredFlights.length,
      persistent,
      tracks: filteredTrajectories.length,
      fetchedAt: snapshot?.fetched_at,
    };
  }, [filteredFlights, filteredTrajectories, snapshot]);

  const ready = !!snapshot;

  return (
    <>
      <div className="canvas-shell">
        <Canvas
          camera={{ position: [2.5, 1.9, -0.5], fov: 35, near: 0.1, far: 100 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl, scene }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            scene.background = new THREE.Color("#03050a");
          }}
        >
          {/* Pure data-driven scene — meshBasicMaterial / shaderMaterial don't react to lights. */}
          <ambientLight intensity={0.5} />

          <Suspense fallback={null}>
            <group rotation={[0, 0, THREE.MathUtils.degToRad(-23.5)]}>
              <Earth />
              <Atmosphere />
              <Trajectories tracks={filteredTrajectories} />
              <Flights flights={filteredFlights} />
            </group>
            <Stars radius={120} depth={50} count={4500} factor={4} saturation={0} fade speed={0.5} />
            <Preload all />
          </Suspense>

          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={1.6}
            maxDistance={8}
            zoomSpeed={0.6}
            rotateSpeed={0.4}
            enableDamping
            dampingFactor={0.06}
          />
        </Canvas>
      </div>

      <div className="ui-overlay">
        <HeaderPanel />
        <StatsPanel counts={counts} />
        <FiltersPanel
          flights={flights}
          trajectories={trajectories}
          filters={filters}
          setFilters={setFilters}
        />
        <GatePanel />
      </div>

      <div className="attribution mono">
        OPENSKY · OPEN-METEO · NASA BLUE MARBLE · BUILT BY ESTUAIRE
      </div>

      <div className={`loading-shroud ${ready ? "hidden" : ""}`}>
        <div className="pulse">Scanning European airspace…</div>
      </div>
    </>
  );
}

function filterAll(items, filters, useOrigin) {
  const ai = filters.airlines, ap = filters.airports, ty = filters.aircraftTypes;
  if (!ai.size && !ap.size && !ty.size) return items;
  return items.filter((it) => {
    if (ai.size && !ai.has(it.airline)) return false;
    if (useOrigin && ap.size && !ap.has(it.origin_icao)) return false;
    if (ty.size && !ty.has(it.aircraft_type)) return false;
    return true;
  });
}

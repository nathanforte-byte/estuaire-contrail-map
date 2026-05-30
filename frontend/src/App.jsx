import { useEffect, useMemo, useState } from "react";
import Earth from "./components/Earth.jsx";
import HeaderPanel from "./components/HeaderPanel.jsx";
import StatsPanel from "./components/StatsPanel.jsx";
import FiltersPanel from "./components/FiltersPanel.jsx";
import GatePanel from "./components/GatePanel.jsx";
import { callsignToAirline } from "./lib/icao.js";

const API_BASE = ""; // same-origin in prod, Vite proxy in dev

function useApi(path, intervalMs) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch {
        /* keep last good payload */
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
  return data;
}

export default function App() {
  const snapshot = useApi("/api/flights", 30000);

  const [filters, setFilters] = useState({
    airlines: new Set(),
    airports: new Set(),
    aircraftTypes: new Set(),
  });

  const flights = useMemo(() => {
    if (!snapshot?.flights) return [];
    return snapshot.flights
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({ ...f, airline: callsignToAirline(f.callsign) }));
  }, [snapshot]);

  const filteredFlights = useMemo(() => apply(flights, filters), [flights, filters]);
  const persistentFlights = useMemo(
    () => filteredFlights.filter((f) => f.risk === "persistent"),
    [filteredFlights],
  );

  const counts = useMemo(
    () => ({
      total: filteredFlights.length,
      persistent: persistentFlights.length,
      fetchedAt: snapshot?.fetched_at,
    }),
    [filteredFlights, persistentFlights, snapshot],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* Globe occupies the full canvas behind the panels */}
      <Earth flights={filteredFlights} />

      {/* Ambient corner + bottom glows — gentle, give the panel blur some
          color to amplify without overwhelming the globe. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-32 -top-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,#1a2a5c_0%,transparent_70%)] opacity-50" />
        <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(closest-side,#2a1a4c_0%,transparent_70%)] opacity-35" />
        <div className="absolute -bottom-40 -left-40 size-[560px] rounded-full bg-[radial-gradient(closest-side,#0a1f4a_0%,transparent_70%)] opacity-50" />
        <div className="absolute -bottom-32 -right-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,#1c2a4f_0%,transparent_70%)] opacity-45" />
        <div className="absolute inset-x-0 bottom-0 h-[42vh] bg-[radial-gradient(80%_60%_at_50%_100%,#0a1f4a_0%,transparent_70%)] opacity-55" />
      </div>

      {/* UI overlay as a CSS Grid — guarantees the 4 corner panels never
          overlap, regardless of how tall any of them grows. Middle row is
          1fr so the globe stays visible through the center. */}
      <div
        className="
          pointer-events-none fixed inset-0 z-10
          grid grid-cols-1 sm:grid-cols-2
          grid-rows-[auto_1fr_auto] gap-4 p-4 sm:gap-5 sm:p-5
          [&>*]:pointer-events-auto
        "
      >
        {/* Top-left */}
        <div className="self-start justify-self-start max-w-full">
          <HeaderPanel snapshot={snapshot} />
        </div>
        {/* Top-right */}
        <div className="self-start justify-self-end hidden sm:block">
          <StatsPanel counts={counts} ready={!!snapshot} />
        </div>

        {/* Middle row left as empty 1fr so panels can't grow into each other */}
        <div className="hidden sm:block" />
        <div className="hidden sm:block" />

        {/* Bottom-left */}
        <div className="self-end justify-self-start max-w-full">
          <FiltersPanel
            flights={flights}
            filters={filters}
            setFilters={setFilters}
          />
        </div>
        {/* Bottom-right */}
        <div className="self-end justify-self-end max-w-full">
          <GatePanel />
        </div>
      </div>

      {/* Floating mobile-only mini stats (since the top-right slot is hidden on sm-) */}
      <div className="sm:hidden">
        <StatsPanel counts={counts} ready={!!snapshot} />
      </div>

      <div className="mono pointer-events-none fixed bottom-2 left-1/2 z-30 -translate-x-1/2 text-[10px] tracking-[0.18em] text-[#3a4256]">
        OPENSKY · OPEN-METEO · NATURAL EARTH · BUILT BY ESTUAIRE
      </div>
    </div>
  );
}

function apply(items, filters) {
  const { airlines: ai, aircraftTypes: ty } = filters;
  if (!ai.size && !ty.size) return items;
  return items.filter((it) => {
    if (ai.size && !ai.has(it.airline)) return false;
    if (ty.size && !ty.has(it.aircraft_type)) return false;
    return true;
  });
}

import { useEffect, useMemo, useState } from "react";
import Earth from "./components/Earth.jsx";
import HeaderPanel from "./components/HeaderPanel.jsx";
import StatsPanel from "./components/StatsPanel.jsx";
import FiltersPanel from "./components/FiltersPanel.jsx";
import GatePanel from "./components/GatePanel.jsx";
import TimeScrubber from "./components/TimeScrubber.jsx";
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
  // Snapshot-stitched trajectories: every airborne flight observed in the
  // last 12 h, polylines built from 5-min position samples. The TimeScrubber
  // lets the user slide a 1-hour window across this range.
  const trajectoriesData = useApi("/api/trajectories-snapshot?hours=12", 120000);

  // Scrubber state — null means "show every trajectory in the loaded window".
  const [scrubberTs, setScrubberTs] = useState(null);
  const SCRUBBER_WINDOW_MS = 60 * 60 * 1000; // ±1 h window

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

  const trajectories = useMemo(() => {
    if (!trajectoriesData?.features) return [];
    return trajectoriesData.features.map((ft) => ({
      ...ft.properties,
      airline: callsignToAirline(ft.properties.callsign),
      coords: ft.geometry.coordinates,
    }));
  }, [trajectoriesData]);

  const filteredFlights = useMemo(() => apply(flights, filters, false), [flights, filters]);
  const filteredTracks = useMemo(() => apply(trajectories, filters, true), [trajectories, filters]);
  const persistentFlights = useMemo(
    () => filteredFlights.filter((f) => f.risk === "persistent"),
    [filteredFlights],
  );

  // Time range covered by the loaded trajectories (drives the scrubber bounds).
  const timeRange = useMemo(() => {
    if (!filteredTracks.length) return null;
    let mn = Infinity;
    let mx = -Infinity;
    for (const t of filteredTracks) {
      const s = new Date(t.first_ts).getTime();
      const e = new Date(t.last_ts).getTime();
      if (s < mn) mn = s;
      if (e > mx) mx = e;
    }
    return { start: mn, end: mx };
  }, [filteredTracks]);

  // Trajectories overlapping the [scrubberTs - window, scrubberTs] band.
  // null → no temporal filter, show every loaded trajectory.
  const scrubbedTracks = useMemo(() => {
    if (scrubberTs == null) return filteredTracks;
    const winStart = scrubberTs - SCRUBBER_WINDOW_MS;
    return filteredTracks.filter((t) => {
      const s = new Date(t.first_ts).getTime();
      const e = new Date(t.last_ts).getTime();
      return s <= scrubberTs && e >= winStart;
    });
  }, [filteredTracks, scrubberTs]);

  const counts = useMemo(
    () => ({
      total: filteredFlights.length,
      persistent: persistentFlights.length,
      tracks: scrubbedTracks.length,
      fetchedAt: snapshot?.fetched_at,
    }),
    [filteredFlights, persistentFlights, scrubbedTracks, snapshot],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* Globe occupies the full canvas behind the panels */}
      <Earth flights={filteredFlights} trajectories={scrubbedTracks} />

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
            trajectories={trajectories}
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

      {/* Time scrubber centred at the bottom — slides a 1 h window through
          the 12 h of loaded trajectories. */}
      <TimeScrubber
        range={timeRange}
        value={scrubberTs}
        onChange={setScrubberTs}
        windowMs={SCRUBBER_WINDOW_MS}
        visibleCount={scrubbedTracks.length}
        totalCount={filteredTracks.length}
      />

      <div className="mono pointer-events-none fixed bottom-2 left-1/2 z-30 -translate-x-1/2 text-[10px] tracking-[0.18em] text-[#3a4256]">
        OPENSKY · OPEN-METEO · NATURAL EARTH · BUILT BY ESTUAIRE
      </div>
    </div>
  );
}

function apply(items, filters, useOrigin) {
  const { airlines: ai, airports: ap, aircraftTypes: ty } = filters;
  if (!ai.size && !ap.size && !ty.size) return items;
  return items.filter((it) => {
    if (ai.size && !ai.has(it.airline)) return false;
    if (useOrigin && ap.size && !ap.has(it.origin_icao)) return false;
    if (ty.size && !ty.has(it.aircraft_type)) return false;
    return true;
  });
}

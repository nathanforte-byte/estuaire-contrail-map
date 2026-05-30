import { useEffect, useMemo, useState } from "react";
import Earth from "./components/Earth.jsx";
import HeaderPanel from "./components/HeaderPanel.jsx";
import StatsPanel from "./components/StatsPanel.jsx";
import FiltersPanel from "./components/FiltersPanel.jsx";
import GatePanel from "./components/GatePanel.jsx";
import TimeScrubber from "./components/TimeScrubber.jsx";
import { callsignToAirline } from "./lib/icao.js";

const API_BASE = "";

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
        /* keep last good */
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
  // Pull every position observed over the last 12 h. The scrubber plays
  // through the 5-min buckets stamped on each row.
  const positionsResp = useApi("/api/positions?hours=12", 120000);

  const [filters, setFilters] = useState({
    airlines: new Set(),
    airports: new Set(),
    aircraftTypes: new Set(),
  });
  // null = stick to the latest bucket (auto-advances as new data arrives).
  // a string ts = freeze the globe on that bucket while scrubbing.
  const [scrubberTs, setScrubberTs] = useState(null);

  // Buckets are pre-sorted descending by the API; lowest index = newest.
  const buckets = useMemo(() => positionsResp?.buckets || [], [positionsResp]);
  const latestBucket = buckets[0] || null;

  // Group raw positions into a Map<bucketTs, flightObjects[]>.
  const positionsByBucket = useMemo(() => {
    const m = new Map();
    for (const row of positionsResp?.positions || []) {
      if (row.lat == null || row.lon == null) continue;
      const enriched = { ...row, airline: callsignToAirline(row.callsign) };
      const arr = m.get(row.ts);
      if (arr) arr.push(enriched);
      else m.set(row.ts, [enriched]);
    }
    return m;
  }, [positionsResp]);

  // What the user is currently looking at on the globe.
  const activeBucket = scrubberTs ?? latestBucket;
  const activeFlights = useMemo(
    () => positionsByBucket.get(activeBucket) || [],
    [positionsByBucket, activeBucket],
  );

  const filteredFlights = useMemo(() => apply(activeFlights, filters), [activeFlights, filters]);
  const persistentFlights = useMemo(
    () => filteredFlights.filter((f) => f.risk === "persistent"),
    [filteredFlights],
  );

  const counts = useMemo(
    () => ({
      total: filteredFlights.length,
      persistent: persistentFlights.length,
      fetchedAt: activeBucket,
    }),
    [filteredFlights, persistentFlights, activeBucket],
  );

  // Scrubber range = first and last bucket timestamp.
  const timeRange = useMemo(() => {
    if (!buckets.length) return null;
    return {
      start: new Date(buckets[buckets.length - 1]).getTime(),
      end: new Date(buckets[0]).getTime(),
    };
  }, [buckets]);

  // The scrubber emits absolute ms; snap it to the closest known bucket so
  // the globe always lands on a concrete frame.
  const onScrub = (ms) => {
    if (ms == null) {
      setScrubberTs(null);
      return;
    }
    let best = buckets[0];
    let bestDist = Infinity;
    for (const b of buckets) {
      const d = Math.abs(new Date(b).getTime() - ms);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    setScrubberTs(best);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <Earth flights={filteredFlights} />

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-32 -top-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,#1a2a5c_0%,transparent_70%)] opacity-50" />
        <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(closest-side,#2a1a4c_0%,transparent_70%)] opacity-35" />
        <div className="absolute -bottom-40 -left-40 size-[560px] rounded-full bg-[radial-gradient(closest-side,#0a1f4a_0%,transparent_70%)] opacity-50" />
        <div className="absolute -bottom-32 -right-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,#1c2a4f_0%,transparent_70%)] opacity-45" />
        <div className="absolute inset-x-0 bottom-0 h-[42vh] bg-[radial-gradient(80%_60%_at_50%_100%,#0a1f4a_0%,transparent_70%)] opacity-55" />
      </div>

      <div
        className="
          pointer-events-none fixed inset-0 z-10
          grid grid-cols-1 sm:grid-cols-2
          grid-rows-[auto_1fr_auto] gap-4 p-4 sm:gap-5 sm:p-5
          [&>*]:pointer-events-auto
        "
      >
        <div className="self-start justify-self-start max-w-full">
          <HeaderPanel snapshot={positionsResp} />
        </div>
        <div className="self-start justify-self-end hidden sm:block">
          <StatsPanel counts={counts} ready={!!positionsResp} />
        </div>

        <div className="hidden sm:block" />
        <div className="hidden sm:block" />

        <div className="self-end justify-self-start max-w-full">
          <FiltersPanel
            flights={activeFlights}
            filters={filters}
            setFilters={setFilters}
          />
        </div>
        <div className="self-end justify-self-end max-w-full">
          <GatePanel />
        </div>
      </div>

      <div className="sm:hidden">
        <StatsPanel counts={counts} ready={!!positionsResp} />
      </div>

      <TimeScrubber
        range={timeRange}
        value={scrubberTs ? new Date(scrubberTs).getTime() : null}
        onChange={onScrub}
        windowMs={5 * 60 * 1000}
        visibleCount={filteredFlights.length}
        totalCount={activeFlights.length}
        label={activeBucket}
      />

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

import { useEffect, useMemo, useState } from "react";
import Earth from "./components/Earth.jsx";
import Sparkles from "./components/Sparkles.jsx";
import StatsLine from "./components/StatsLine.jsx";
import GateBand from "./components/GateBand.jsx";

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
  const snapshot = useApi("/api/flights", 30000);

  const { markers, total, persistent } = useMemo(() => {
    const flights = (snapshot?.flights || []).filter(
      (f) => f.lat != null && f.lon != null,
    );
    const persistentFlights = flights.filter((f) => f.risk === "persistent");
    // Cobe takes [{ location: [lat, lon], size }]. We only feed persistent
    // contrail flights so the globe reads as "where contrails form right now".
    return {
      total: flights.length,
      persistent: persistentFlights.length,
      markers: persistentFlights.map((f) => ({
        location: [f.lat, f.lon],
        size: 0.045,
      })),
    };
  }, [snapshot]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <article className="relative z-10 grid gap-5 pt-12 text-center">
        <span className="mx-auto inline-block w-fit rounded-full border border-[#3273ff] bg-[#0f1c35] px-3 py-1 text-sm font-medium tracking-[-0.005em] text-[#cfd9ff]">
          Live · {snapshot ? "scanning European airspace" : "connecting…"}
        </span>

        <h1 className="bg-gradient-to-b from-[#edeffd] to-[#7b9cda] bg-clip-text text-4xl font-semibold leading-[100%] tracking-tighter text-transparent md:text-6xl">
          Where contrails are forming
          <br />
          over Europe — right now.
        </h1>

        <StatsLine
          total={total}
          persistent={persistent}
          fetchedAt={snapshot?.fetched_at}
        />

        <Earth markers={markers} />
      </article>

      {/* Stage: radial glow + curved horizon ring + sparkles */}
      <div
        className="
          relative -mt-32 h-80 w-screen overflow-hidden
          [mask-image:radial-gradient(50%_50%,white,transparent)]
          before:absolute before:inset-0
          before:bg-[radial-gradient(circle_at_bottom_center,#3273ff,transparent_90%)]
          before:opacity-40
          after:absolute after:-left-1/2 after:top-1/2
          after:aspect-[1/0.7] after:w-[200%]
          after:rounded-[10%] after:border-t after:border-[#163474]
          after:bg-[#08132b]
        "
      >
        <Sparkles
          density={800}
          speed={1.2}
          size={1.2}
          direction="top"
          opacitySpeed={2}
          color="#32A7FF"
          className="absolute inset-x-0 bottom-0 h-full w-full"
        />
      </div>

      <GateBand />

      <div className="mono pointer-events-none fixed bottom-2 left-1/2 z-30 -translate-x-1/2 text-[10px] tracking-[0.18em] text-[#3a4256]">
        OPENSKY · OPEN-METEO · NATURAL EARTH · BUILT BY ESTUAIRE
      </div>
    </div>
  );
}

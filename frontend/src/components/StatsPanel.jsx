import { useEffect, useState } from "react";

function formatAge(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function StatsPanel({ counts, ready }) {
  // Tick once a minute so "23s ago" → "1m ago" updates without page churn.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      className="
        glass absolute right-5 top-5 z-20 min-w-[240px] rounded-2xl
        animate-in fade-in slide-in-from-top-2 duration-500
      "
    >
      <div className="flex flex-col divide-y divide-white/5">
        <Stat label="Airborne · Europe" value={counts.total} ready={ready} />
        <Stat label="Persistent now" value={counts.persistent} ready={ready} accent />
        <Stat label="Tracks · 24 h" value={counts.tracks} ready={ready} />
        <div className="flex items-baseline justify-between px-[18px] py-[10px]">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[#7b9cda]">Snapshot</span>
          <span className="mono text-[11px] text-[#7b9cda]">{formatAge(counts.fetchedAt)}</span>
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value, ready, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-[18px] py-[10px]">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-[#7b9cda]">{label}</span>
      <span
        className={
          "mono text-[22px] font-semibold leading-none tracking-[-0.02em] " +
          (accent ? "text-[#ff4d6d]" : "text-[#edeffd]")
        }
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {ready ? (value || 0).toLocaleString() : <span className="opacity-30">—</span>}
      </span>
    </div>
  );
}

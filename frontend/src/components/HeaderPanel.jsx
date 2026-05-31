import { useEffect, useState } from "react";

const RISKS = [
  { key: "persistent", label: "Persistent contrail · now", color: "#ff4d6d" },
  { key: "other", label: "Other airborne flights", color: "#a8d2ff" },
];

function formatAge(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function HeaderPanel({ snapshot, counts, ready }) {
  const [open, setOpen] = useState(false);
  const live = !!snapshot;

  // Tick "snapshot age" every 15 s so the label stays current without a
  // full re-render storm.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      className="
        glass w-[min(340px,calc(100vw-32px))]
        rounded-2xl px-4 py-[12px]
        animate-in fade-in slide-in-from-top-2 duration-500
      "
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#7b9cda]">
        <span className="relative inline-flex size-[7px] items-center justify-center">
          <span
            className="absolute size-full rounded-full bg-[#3273ff] opacity-60"
            style={{ animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite" }}
          />
          <span className="relative size-[6px] rounded-full bg-[#3273ff] shadow-[0_0_8px_#3273ff]" />
        </span>
        <span className="font-medium text-[#cfd9ff]">Estuaire</span>
        <span aria-hidden className="text-[#3a4256]">·</span>
        <span>{live ? "Live Atlas" : "Connecting"}</span>
      </div>

      <h1 className="mt-[6px] bg-gradient-to-b from-[#edeffd] to-[#7b9cda] bg-clip-text text-[17px] font-semibold leading-[1.18] tracking-[-0.02em] text-transparent">
        Contrails over Europe · right now
      </h1>

      {/* Stat block — moved up from the old top-right StatsPanel. */}
      <div className="mt-3 flex flex-col divide-y divide-white/5 rounded-lg border border-white/[0.04] bg-white/[0.02]">
        <Stat label="Airborne · Europe" value={counts?.total} ready={ready} />
        <Stat label="Persistent now" value={counts?.persistent} ready={ready} accent />
        <div className="flex items-baseline justify-between px-3 py-[6px]">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#7b9cda]">Snapshot</span>
          <span className="mono text-[10.5px] text-[#7b9cda]">{formatAge(counts?.fetchedAt)}</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-[6px]">
        {RISKS.map((r) => (
          <li key={r.key} className="flex items-center gap-[10px] text-[11.5px] text-[#a0aac3]">
            <span
              className="size-[8px] flex-shrink-0 rounded-full"
              style={{ background: r.color, boxShadow: `0 0 10px ${r.color}, 0 0 2px ${r.color}` }}
            />
            {r.label}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[#7b9cda] transition-colors hover:text-[#cfd9ff]"
      >
        <span
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ›
        </span>
        {open ? "Hide context" : "What does this mean?"}
      </button>

      {open && (
        <p className="mt-2 max-w-[34ch] text-[11.5px] leading-[1.55] text-[#a0aac3]">
          Persistent condensation trails account for roughly{" "}
          <span className="text-[#edeffd]">half of aviation's climate forcing</span>. Every red
          track is a flight crossing an ice-supersaturated region — where its exhaust seeds a
          long-lived contrail cirrus.
        </p>
      )}

      <style>{`@keyframes ping{75%,100%{transform:scale(2.4);opacity:0}}`}</style>
    </aside>
  );
}

function Stat({ label, value, ready, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-[7px]">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[#7b9cda]">{label}</span>
      <span
        className={
          "mono text-[18px] font-semibold leading-none tracking-[-0.02em] " +
          (accent ? "text-[#ff4d6d]" : "text-[#edeffd]")
        }
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {ready ? (value || 0).toLocaleString() : <span className="opacity-30">—</span>}
      </span>
    </div>
  );
}

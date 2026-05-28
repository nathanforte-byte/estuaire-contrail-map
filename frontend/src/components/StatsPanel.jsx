import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

function formatAge(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function AnimatedNumber({ value }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.6 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  return <motion.span>{rounded}</motion.span>;
}

export default function StatsPanel({ counts, ready }) {
  // Live age recalculation — single rAF tick is overkill, 1 Hz is enough.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, y: -8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 }}
      className="glass absolute right-5 top-5 min-w-[240px] rounded-2xl"
    >
      <div className="flex flex-col divide-y divide-[var(--color-line)]">
        <Stat label="Airborne · Europe" value={counts.total} ready={ready} />
        <Stat label="Persistent now" value={counts.persistent} ready={ready} accent />
        <Stat label="Tracks · 24 h" value={counts.tracks} ready={ready} />
        <div className="flex items-baseline justify-between px-[18px] py-[10px]">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-2)]">
            Snapshot
          </span>
          <span className="mono text-[11px] text-[var(--color-ink-2)]">
            {formatAge(counts.fetchedAt)}
          </span>
        </div>
      </div>
    </motion.aside>
  );
}

function Stat({ label, value, ready, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-[18px] py-[10px]">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-2)]">
        {label}
      </span>
      <span
        className={
          "mono tabular text-[22px] font-semibold leading-none tracking-[-0.02em] " +
          (accent ? "text-[var(--color-rose)]" : "text-[var(--color-ink-0)]")
        }
      >
        {ready ? <AnimatedNumber value={value || 0} /> : <span className="opacity-30">—</span>}
      </span>
    </div>
  );
}

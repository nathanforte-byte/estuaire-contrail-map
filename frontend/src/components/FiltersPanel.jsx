import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  airlineLabel,
  airportLabel,
  aircraftLabel,
} from "../lib/icao.js";

function distinctSorted(values, labelFn) {
  const counts = new Map();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count, label: labelFn(code) }));
}

export default function FiltersPanel({ flights, trajectories, filters, setFilters }) {
  const [open, setOpen] = useState(true);

  const airlines = useMemo(
    () =>
      distinctSorted(
        [...flights.map((f) => f.airline), ...trajectories.map((t) => t.airline)],
        airlineLabel,
      ),
    [flights, trajectories],
  );
  const airports = useMemo(
    () => distinctSorted(trajectories.map((t) => t.origin_icao), airportLabel),
    [trajectories],
  );
  const types = useMemo(
    () =>
      distinctSorted(
        [
          ...flights.map((f) => f.aircraft_type),
          ...trajectories.map((t) => t.aircraft_type),
        ],
        aircraftLabel,
      ),
    [flights, trajectories],
  );

  const toggle = (kind, code) => {
    setFilters((prev) => {
      const next = {
        airlines: new Set(prev.airlines),
        airports: new Set(prev.airports),
        aircraftTypes: new Set(prev.aircraftTypes),
      };
      next[kind].has(code) ? next[kind].delete(code) : next[kind].add(code);
      return next;
    });
  };

  const reset = () =>
    setFilters({ airlines: new Set(), airports: new Set(), aircraftTypes: new Set() });

  const total = filters.airlines.size + filters.airports.size + filters.aircraftTypes.size;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.18 }}
      className="glass absolute bottom-5 left-5 flex w-[min(320px,calc(100vw-40px))] max-h-[58vh] flex-col overflow-hidden rounded-2xl"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-[18px] py-[14px] text-left transition-colors hover:bg-[rgb(255_255_255_/_0.02)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-ink-1)]">
            Filters
          </span>
          <AnimatePresence>
            {total > 0 && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="mono inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-rose-soft)] px-[5px] text-[10px] text-[var(--color-rose)]"
              >
                {total}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          className="text-[var(--color-ink-2)]"
        >
          <Chevron />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="scroll-fade overflow-y-auto px-[18px] py-[14px]">
              <Section
                label="Airline"
                items={airlines}
                selected={filters.airlines}
                onToggle={(c) => toggle("airlines", c)}
                empty="No airline data yet."
              />
              <Section
                label="Origin airport"
                items={airports}
                selected={filters.airports}
                onToggle={(c) => toggle("airports", c)}
                empty="No tracks yet — collected daily at 06:00 UTC."
              />
              <Section
                label="Aircraft type"
                items={types}
                selected={filters.aircraftTypes}
                onToggle={(c) => toggle("aircraftTypes", c)}
                empty="Enrichment populating each hour…"
              />

              <button
                onClick={reset}
                disabled={!total}
                className="mt-2 w-full rounded-md border border-[var(--color-line)] py-[7px] text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-ink-2)] transition-all hover:border-[var(--color-line-2)] hover:text-[var(--color-ink-0)] active:scale-[0.985] disabled:cursor-default disabled:opacity-50 disabled:hover:border-[var(--color-line)] disabled:hover:text-[var(--color-ink-2)]"
              >
                {total ? "Reset all filters" : "No filters applied"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function Section({ label, items, selected, onToggle, empty }) {
  return (
    <div className="mb-[14px] last:mb-0">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-ink-2)]">
          {label}
        </span>
        {items.length > 0 && (
          <span className="mono text-[10.5px] text-[var(--color-ink-3)]">
            {items.length} option{items.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-line)] px-3 py-2 text-[11px] text-[var(--color-ink-3)]">
          {empty}
        </div>
      ) : (
        <motion.div
          className="scroll-fade flex max-h-[100px] flex-wrap gap-1 overflow-y-auto pr-1"
          variants={{ show: { transition: { staggerChildren: 0.012 } } }}
          initial="hidden"
          animate="show"
        >
          {items.map(({ code, count, label: l }) => {
            const isActive = selected.has(code);
            return (
              <motion.button
                key={code}
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 4 },
                  show: { opacity: 1, y: 0 },
                }}
                onClick={() => onToggle(code)}
                title={code}
                whileTap={{ scale: 0.94 }}
                animate={{
                  backgroundColor: isActive ? "var(--color-rose)" : "rgb(255 255 255 / 0.025)",
                  color: isActive ? "#fff" : "var(--color-ink-1)",
                  borderColor: isActive ? "var(--color-rose)" : "var(--color-line)",
                }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className="whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[11.5px] leading-[1.5] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-rose)]"
              >
                {l} <span className="mono opacity-60">· {count}</span>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path
        d="M2 4l3.5 3.5L9 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

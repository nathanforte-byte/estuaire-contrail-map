import { useMemo, useState } from "react";
import { airlineLabel, aircraftLabel } from "../lib/icao.js";

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

export default function FiltersPanel({ flights, filters, setFilters }) {
  const [open, setOpen] = useState(true);

  const airlines = useMemo(
    () => distinctSorted(flights.map((f) => f.airline), airlineLabel),
    [flights],
  );
  const types = useMemo(
    () => distinctSorted(flights.map((f) => f.aircraft_type), aircraftLabel),
    [flights],
  );

  const toggle = (kind, code) =>
    setFilters((prev) => {
      const next = {
        airlines: new Set(prev.airlines),
        airports: new Set(prev.airports),
        aircraftTypes: new Set(prev.aircraftTypes),
      };
      next[kind].has(code) ? next[kind].delete(code) : next[kind].add(code);
      return next;
    });

  const reset = () =>
    setFilters({ airlines: new Set(), airports: new Set(), aircraftTypes: new Set() });

  const active = filters.airlines.size + filters.aircraftTypes.size;

  return (
    <aside
      className="
        glass flex max-h-[calc(100vh-260px)] w-[min(320px,calc(100vw-32px))]
        flex-col overflow-hidden rounded-2xl
        animate-in fade-in slide-in-from-bottom-2 duration-500
      "
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          flex items-center justify-between gap-3 border-b border-white/5 px-[18px] py-[14px]
          text-left transition-colors hover:bg-white/[0.02]
        "
      >
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#cfd9ff]">
            Filters
          </span>
          {active > 0 && (
            <span className="mono inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff4d6d]/20 px-[5px] text-[10px] text-[#ff4d6d]">
              {active}
            </span>
          )}
        </div>
        <span
          className="text-[#7b9cda] transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <Chevron />
        </span>
      </button>

      <div
        className="overflow-hidden transition-[max-height] duration-300"
        style={{ maxHeight: open ? "60vh" : "0px" }}
      >
        <div className="scroll-thin overflow-y-auto px-[18px] py-[14px]">
          <Section
            label="Airline"
            items={airlines}
            selected={filters.airlines}
            onToggle={(c) => toggle("airlines", c)}
            empty="No airline data yet."
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
            disabled={!active}
            className="
              mt-2 w-full rounded-md border border-white/5 py-[7px] text-[10.5px] uppercase
              tracking-[0.08em] text-[#7b9cda] transition-all
              hover:border-white/10 hover:text-white active:scale-[0.985]
              disabled:cursor-default disabled:opacity-50 disabled:hover:border-white/5 disabled:hover:text-[#7b9cda]
            "
          >
            {active ? "Reset all filters" : "No filters applied"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({ label, items, selected, onToggle, empty }) {
  return (
    <div className="mb-[14px] last:mb-0">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-[#7b9cda]">{label}</span>
        {items.length > 0 && (
          <span className="mono text-[10.5px] text-[#5e6f93]">
            {items.length} option{items.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/5 px-3 py-2 text-[11px] text-[#5e6f93]">
          {empty}
        </div>
      ) : (
        <div className="scroll-thin flex max-h-[100px] flex-wrap gap-1 overflow-y-auto pr-1">
          {items.map(({ code, count, label: l }) => {
            const isActive = selected.has(code);
            return (
              <button
                key={code}
                type="button"
                title={code}
                onClick={() => onToggle(code)}
                className={
                  "whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[11.5px] leading-[1.5] outline-none transition-all duration-150 active:scale-[0.94] " +
                  (isActive
                    ? "border-[#ff4d6d] bg-[#ff4d6d] text-white"
                    : "border-white/5 bg-white/[0.025] text-[#cfd9ff] hover:border-white/15 hover:text-white")
                }
              >
                {l} <span className="mono opacity-60">· {count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M2 4l3.5 3.5L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

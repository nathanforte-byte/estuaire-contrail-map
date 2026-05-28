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

function Chips({ items, selected, onToggle }) {
  return (
    <div className="chips">
      {items.map(({ code, count, label }) => (
        <button
          key={code}
          className={"chip" + (selected.has(code) ? " active" : "")}
          onClick={() => onToggle(code)}
          title={code}
        >
          {label} · {count}
        </button>
      ))}
    </div>
  );
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
      const set = next[kind];
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return next;
    });
  };

  const reset = () =>
    setFilters({ airlines: new Set(), airports: new Set(), aircraftTypes: new Set() });

  const anyActive =
    filters.airlines.size + filters.airports.size + filters.aircraftTypes.size > 0;

  return (
    <div className="panel panel--filters">
      <div className="filters-header" onClick={() => setOpen((o) => !o)}>
        <h3>Filters{anyActive ? " · active" : ""}</h3>
        <span className="toggle mono">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="filters-body">
          <Section
            label="Airline"
            count={airlines.length}
            items={airlines}
            selected={filters.airlines}
            onToggle={(c) => toggle("airlines", c)}
            empty="No airline data yet."
          />
          <Section
            label="Origin airport"
            count={airports.length}
            items={airports}
            selected={filters.airports}
            onToggle={(c) => toggle("airports", c)}
            empty="No tracks yet — fetched daily at 06:00 UTC."
          />
          <Section
            label="Aircraft type"
            count={types.length}
            items={types}
            selected={filters.aircraftTypes}
            onToggle={(c) => toggle("aircraftTypes", c)}
            empty="Enrichment runs hourly — populating…"
          />
          <button className="filter-reset" onClick={reset} disabled={!anyActive}>
            {anyActive ? "RESET ALL FILTERS" : "NO FILTERS APPLIED"}
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, count, items, selected, onToggle, empty }) {
  return (
    <div className="filter-section">
      <div className="label-row">
        <label>{label}</label>
        <span className="count mono">{count > 0 ? `${count} option${count > 1 ? "s" : ""}` : ""}</span>
      </div>
      {items.length > 0 ? (
        <Chips items={items} selected={selected} onToggle={onToggle} />
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "4px 0" }}>{empty}</div>
      )}
    </div>
  );
}

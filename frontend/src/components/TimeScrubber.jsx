import { useMemo } from "react";

/**
 * TimeScrubber — bottom-of-screen slider that moves a fixed window across
 * the loaded trajectories' time range.
 *
 *   null  → "all loaded trajectories" (no temporal filter)
 *   ts    → only trajectories overlapping [ts - windowMs, ts]
 *
 * The track itself shows the data extent; the handle is the focus point.
 * A faint stripe under the handle hints at the window length.
 */
export default function TimeScrubber({
  range,
  value,
  onChange,
  windowMs,
  visibleCount,
  totalCount,
}) {
  // Step the slider every 5 min (matches the data granularity).
  const STEP_MS = 5 * 60 * 1000;

  const { min, max, step } = useMemo(() => {
    if (!range) return { min: 0, max: 0, step: STEP_MS };
    return {
      min: Math.floor(range.start / STEP_MS) * STEP_MS,
      max: Math.ceil(range.end / STEP_MS) * STEP_MS,
      step: STEP_MS,
    };
  }, [range]);

  if (!range || max - min < STEP_MS) return null;

  const isActive = value != null;
  const ts = value ?? max;

  const windowPct = Math.min(100, (windowMs / (max - min)) * 100);
  const handlePct = ((ts - min) / (max - min)) * 100;

  return (
    <aside
      className="
        glass pointer-events-auto fixed bottom-5 left-1/2 z-30 -translate-x-1/2
        flex w-[min(640px,calc(100vw-32px))] items-center gap-4
        rounded-2xl px-4 py-[10px]
      "
    >
      <button
        type="button"
        onClick={() => onChange(isActive ? null : max)}
        className={
          "shrink-0 rounded-full border px-3 py-[5px] text-[10.5px] uppercase tracking-[0.12em] transition-all active:scale-[0.96] " +
          (isActive
            ? "border-white/10 text-[#7b9cda] hover:text-white hover:border-white/20"
            : "border-[#3273ff]/40 bg-[#3273ff]/15 text-[#cfd9ff]")
        }
      >
        {isActive ? "Show all" : "All time"}
      </button>

      <div className="relative flex-1">
        {/* Track */}
        <div className="relative h-[6px] rounded-full bg-white/[0.06] overflow-hidden">
          {/* Window highlight under the handle */}
          {isActive && (
            <div
              className="absolute inset-y-0 bg-gradient-to-r from-transparent via-[#3273ff]/55 to-transparent"
              style={{
                left: `calc(${handlePct}% - ${windowPct}%)`,
                width: `${windowPct}%`,
              }}
            />
          )}
        </div>

        {/* Native range — invisible, on top, for accessibility + drag */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={ts}
          onChange={(e) => onChange(Number(e.target.value))}
          className="
            absolute inset-x-0 top-1/2 -translate-y-1/2 h-6 w-full appearance-none bg-transparent
            cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:size-[14px]
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(50,115,255,0.35),0_0_12px_rgba(50,115,255,0.7)]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:size-[14px]
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-none
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:shadow-[0_0_0_3px_rgba(50,115,255,0.35),0_0_12px_rgba(50,115,255,0.7)]
          "
        />
      </div>

      <div className="shrink-0 text-right leading-tight">
        <div className="mono text-[12px] text-[#edeffd]" style={{ fontVariantNumeric: "tabular-nums" }}>
          {isActive ? `${fmtTime(ts - windowMs)} → ${fmtTime(ts)}` : `${fmtTime(min)} → ${fmtTime(max)}`}
        </div>
        <div className="mono text-[10px] text-[#7b9cda]" style={{ fontVariantNumeric: "tabular-nums" }}>
          {visibleCount.toLocaleString()} of {totalCount.toLocaleString()} tracks
        </div>
      </div>
    </aside>
  );
}

function fmtTime(ms) {
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

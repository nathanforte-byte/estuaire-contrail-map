import { useState } from "react";

const RISKS = [
  { key: "persistent", label: "Persistent contrail · now", color: "#ff4d6d" },
  { key: "other", label: "Other airborne flights", color: "#a8d2ff" },
];

export default function HeaderPanel({ snapshot }) {
  const [open, setOpen] = useState(false);
  const live = !!snapshot;

  return (
    <aside
      className="
        glass w-[min(340px,calc(100vw-32px))]
        rounded-2xl px-4 py-[12px]
        animate-in fade-in slide-in-from-top-2 duration-500
      "
    >
      {/* Top status row + tiny inline legend dots — always visible, ~64 px total */}
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

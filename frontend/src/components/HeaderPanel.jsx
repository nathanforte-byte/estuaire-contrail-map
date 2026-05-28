const RISKS = [
  { key: "persistent", label: "Persistent contrail (ISSR)", color: "#ff4d6d" },
  { key: "short", label: "Short-lived", color: "#e0a14a" },
  { key: "none", label: "No formation", color: "#6aa9c2" },
];

export default function HeaderPanel({ snapshot }) {
  const live = !!snapshot;
  return (
    <aside
      className="
        glass absolute left-5 top-5 z-20 w-[min(360px,calc(100vw-40px))]
        rounded-2xl px-5 pb-5 pt-[18px]
        animate-in fade-in slide-in-from-top-2 duration-500
      "
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#7b9cda]">
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

      <h1 className="mb-2 bg-gradient-to-b from-[#edeffd] to-[#7b9cda] bg-clip-text text-[19px] font-semibold leading-[1.15] tracking-[-0.02em] text-transparent">
        Where contrails are forming over Europe — right now.
      </h1>

      <p className="mb-4 max-w-[34ch] text-[12.5px] leading-[1.55] text-[#a0aac3]">
        Persistent condensation trails account for roughly{" "}
        <span className="text-[#edeffd]">half of aviation's climate forcing</span>. Every red
        track is a flight crossing an ice-supersaturated region — where its exhaust seeds a
        long-lived contrail cirrus.
      </p>

      <ul className="flex flex-col gap-[6px]">
        {RISKS.map((r) => (
          <li key={r.key} className="flex items-center gap-[10px] text-[12px] text-[#a0aac3]">
            <span
              className="size-[9px] flex-shrink-0 rounded-full"
              style={{ background: r.color, boxShadow: `0 0 12px ${r.color}, 0 0 2px ${r.color}` }}
            />
            {r.label}
          </li>
        ))}
      </ul>

      <style>{`@keyframes ping{75%,100%{transform:scale(2.4);opacity:0}}`}</style>
    </aside>
  );
}

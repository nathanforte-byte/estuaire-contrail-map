import { motion } from "framer-motion";

const RISKS = [
  { key: "persistent", label: "Persistent contrail (ISSR)", color: "var(--color-rose)" },
  { key: "short", label: "Short-lived", color: "var(--color-amber)" },
  { key: "none", label: "No formation", color: "var(--color-cyan)" },
];

export default function HeaderPanel() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: -8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.05 }}
      className="glass absolute left-5 top-5 w-[min(360px,calc(100vw-40px))] rounded-2xl px-5 pb-5 pt-[18px]"
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
        <PulsingDot />
        <span className="font-medium text-[var(--color-ink-1)]">Estuaire</span>
        <span aria-hidden className="text-[var(--color-ink-3)]">·</span>
        <span>Live Atlas</span>
      </div>

      <h1 className="mb-2 text-[19px] font-semibold leading-[1.12] tracking-[-0.02em] text-[var(--color-ink-0)]">
        Where contrails are forming over Europe — right now.
      </h1>

      <p className="mb-4 max-w-[34ch] text-[12.5px] leading-[1.55] text-[var(--color-ink-1)]">
        Persistent condensation trails account for roughly{" "}
        <span className="text-[var(--color-ink-0)]">half of aviation's climate forcing</span>.
        Every red track is a flight crossing an ice-supersaturated region — where its exhaust
        seeds a long-lived contrail cirrus.
      </p>

      <ul className="flex flex-col gap-[6px]">
        {RISKS.map((r, i) => (
          <motion.li
            key={r.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 140, damping: 22 }}
            className="flex items-center gap-[10px] text-[12px] text-[var(--color-ink-1)]"
          >
            <span
              className="size-[9px] flex-shrink-0 rounded-full"
              style={{
                background: r.color,
                boxShadow: `0 0 12px ${r.color}, 0 0 2px ${r.color}`,
              }}
            />
            {r.label}
          </motion.li>
        ))}
      </ul>
    </motion.aside>
  );
}

function PulsingDot() {
  return (
    <span className="relative inline-flex size-[7px] items-center justify-center">
      <motion.span
        className="absolute size-full rounded-full"
        style={{ background: "var(--color-rose)" }}
        animate={{ scale: [1, 2.4, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
      <span
        className="relative size-[6px] rounded-full"
        style={{ background: "var(--color-rose)", boxShadow: "0 0 6px var(--color-rose)" }}
      />
    </span>
  );
}

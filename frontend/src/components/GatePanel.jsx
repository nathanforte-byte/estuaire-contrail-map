import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";

export default function GatePanel() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email) return;
    // v0.6 will POST to /api/lead → Supabase + Slack ping.
    console.log("lead", email);
    setSent(true);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.22 }}
      className="glass absolute bottom-5 right-5 w-[min(320px,calc(100vw-40px))] rounded-2xl px-5 pb-[18px] pt-4"
    >
      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
        For operators
      </div>
      <h3 className="mb-1 text-[15px] font-semibold leading-tight tracking-[-0.015em] text-[var(--color-ink-0)]">
        Track contrails by your fleet
      </h3>
      <p className="mb-3 max-w-[35ch] text-[12px] leading-[1.5] text-[var(--color-ink-1)]">
        Daily report of contrail-formation crossings per airframe, route, and operator. Built on
        Estuaire's full physics model.
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="flex items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-rose-soft)] px-3 py-[7px] text-[12px] text-[var(--color-ink-0)]"
          >
            <CheckCircle weight="duotone" size={16} className="text-[var(--color-rose)]" />
            We'll reach out within 24 hours.
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="flex flex-col gap-2"
          >
            <label htmlFor="lead-email" className="sr-only">Work email</label>
            <input
              id="lead-email"
              type="email"
              required
              autoComplete="email"
              placeholder="work@airline.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[var(--color-line)] bg-[rgb(255_255_255_/_0.025)] px-3 py-[8px] text-[13px] outline-none placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-rose)] focus:bg-[rgb(255_255_255_/_0.04)]"
            />
            <MagneticButton type="submit">
              <span>Request access</span>
              <ArrowRight weight="bold" size={14} />
            </MagneticButton>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

/** Magnetic CTA — uses MotionValue, never re-renders. */
function MagneticButton({ children, ...rest }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 250, damping: 22, mass: 0.4 });
  const tx = useTransform(sx, (v) => v * 0.18);
  const ty = useTransform(sy, (v) => v * 0.18);

  const handleMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set(e.clientX - (r.left + r.width / 2));
    y.set(e.clientY - (r.top + r.height / 2));
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: tx, y: ty }}
      whileTap={{ scale: 0.97 }}
      className="group inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-rose)] px-3 py-[8px] text-[13px] font-semibold tracking-[-0.005em] text-white shadow-[0_8px_24px_-12px_rgb(214_53_86_/_0.6),inset_0_1px_0_rgb(255_255_255_/_0.18)] transition-[filter] hover:brightness-110"
      {...rest}
    >
      {children}
    </motion.button>
  );
}

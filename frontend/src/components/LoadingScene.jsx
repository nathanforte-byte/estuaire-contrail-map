import { motion } from "framer-motion";

/**
 * Skeletal loading scene — matches the final layout (header, stats, filters,
 * gate) with shimmering placeholder blocks. Fades out once the first
 * snapshot lands.
 */
export default function LoadingScene() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-none fixed inset-0 z-50 bg-[var(--color-surface-0)]"
    >
      {/* Status line */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="mono mb-2 text-[10px] uppercase tracking-[0.32em] text-[var(--color-ink-2)]">
          Scanning European airspace
        </div>
        <div className="relative h-px w-[160px] overflow-hidden bg-[var(--color-line)]">
          <motion.div
            className="absolute inset-y-0 w-[40%] bg-[var(--color-rose)]"
            animate={{ x: ["-100%", "250%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
          />
        </div>
      </div>

      {/* Skeleton panels matching the live layout */}
      <SkeletonPanel className="absolute left-5 top-5 h-[176px] w-[min(360px,calc(100vw-40px))]" />
      <SkeletonPanel className="absolute right-5 top-5 h-[176px] w-[240px]" />
      <SkeletonPanel className="absolute bottom-5 left-5 h-[240px] w-[min(320px,calc(100vw-40px))]" />
      <SkeletonPanel className="absolute bottom-5 right-5 h-[176px] w-[min(320px,calc(100vw-40px))]" />
    </motion.div>
  );
}

function SkeletonPanel({ className }) {
  return (
    <div
      className={
        "glass shimmer rounded-2xl " +
        className
      }
    />
  );
}

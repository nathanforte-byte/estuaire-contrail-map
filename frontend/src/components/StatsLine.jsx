function formatAge(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export default function StatsLine({ total, persistent, fetchedAt }) {
  return (
    <div className="mono mx-auto flex w-fit items-center gap-5 text-[12px] text-[#7b9cda]">
      <Item label="airborne" value={total ? total.toLocaleString() : "—"} />
      <span className="text-[#3a4256]">·</span>
      <Item
        label="forming persistent trails"
        value={persistent ? persistent.toLocaleString() : "—"}
        accent
      />
      <span className="text-[#3a4256]">·</span>
      <Item label="snapshot" value={formatAge(fetchedAt) + " ago"} muted />
    </div>
  );
}

function Item({ label, value, accent, muted }) {
  return (
    <span className="flex items-baseline gap-[6px]">
      <span
        className={
          "text-[14px] " +
          (accent ? "text-[#ff7185] font-semibold" : muted ? "text-[#5e6f93]" : "text-[#edeffd]")
        }
      >
        {value}
      </span>
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#5e6f93]">{label}</span>
    </span>
  );
}

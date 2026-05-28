function formatAge(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export default function StatsPanel({ counts }) {
  return (
    <div className="panel panel--stats">
      <div className="stat-row">
        <span className="label">Airborne · Europe</span>
        <span className="value mono">{(counts.total || 0).toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="label">Persistent now</span>
        <span className="value accent mono">{(counts.persistent || 0).toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="label">Tracks · 24 h</span>
        <span className="value mono">{(counts.tracks || 0).toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="label">Snapshot</span>
        <span className="delta mono">{formatAge(counts.fetchedAt)}</span>
      </div>
    </div>
  );
}

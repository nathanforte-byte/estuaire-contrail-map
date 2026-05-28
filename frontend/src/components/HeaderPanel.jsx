export default function HeaderPanel() {
  return (
    <div className="panel panel--header">
      <div className="brand">
        <span className="dot" /> ESTUAIRE · LIVE ATLAS
      </div>
      <h1 className="title">Contrails forming over Europe — right now.</h1>
      <p className="tagline">
        Persistent condensation trails account for roughly{" "}
        <b>half of aviation's climate forcing</b>. Every red track below is a
        flight crossing an ice-supersaturated region — where its exhaust seeds
        a long-lived contrail cirrus.
      </p>
      <div className="legend">
        <div className="legend-row">
          <span className="legend-dot persistent" /> Persistent contrail (ISSR)
        </div>
        <div className="legend-row">
          <span className="legend-dot short" /> Short-lived
        </div>
        <div className="legend-row">
          <span className="legend-dot none" /> No formation
        </div>
      </div>
    </div>
  );
}

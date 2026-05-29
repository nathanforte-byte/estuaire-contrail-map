import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

import { aircraftLabel, airlineLabel } from "../lib/icao.js";

/**
 * Earth — react-globe.gl dashboard map.
 *
 * Visual style: dotted continents on near-black sphere, blue atmospheric
 * halo, single hot accent for persistent contrail flights, glow path lines
 * for the 24 h trajectory backlog.
 *
 *   - dotted continents: hexPolygons from Natural Earth 110m countries
 *   - static, centered on Europe (no auto-rotate, user can still drag)
 *   - persistent flights → `pointsData`
 *   - trajectories       → `pathsData` (one polyline per icao24)
 */
// Binary visual encoding:
//  - flights forming a persistent contrail right now → hot rose, big, lifted
//  - every other airborne flight                    → pale blue, tiny, near-surface
const COLOR_HOT = "#ff4d6d";
const COLOR_COLD = "#a8d2ff";
const isPersistent = (f) => f.risk === "persistent";

// Hover tooltip — react-globe.gl renders this HTML next to the cursor.
function trajectoryLabel(t) {
  const callsign = (t.callsign || t.icao24 || "—").trim();
  const airlineCode = (t.callsign || "").slice(0, 3).toUpperCase();
  const airlineName = airlineLabel(airlineCode);
  const country = t.country || "—";
  const risk = t.risk || "unknown";
  const persistent = risk === "persistent";
  const aircraftCode = t.aircraft_type;
  const aircraftHuman = aircraftCode ? aircraftLabel(aircraftCode) : null;

  const fmtTime = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "—";
    }
  };
  const first = fmtTime(t.first_ts);
  const last = fmtTime(t.last_ts);
  const dot = persistent ? "#ff4d6d" : "#78afe6";
  const riskLabel = persistent ? "Persistent contrail" : "No persistent contrail";

  const aircraftLine = aircraftHuman
    ? `<div style="color:#cfd9ff; margin-top:2px">${aircraftHuman}<span style="color:#5e6f93; font-size:10.5px; margin-left:6px">${aircraftCode}</span></div>`
    : "";

  return `
    <div style="
      font-family: Geist, -apple-system, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      padding: 10px 12px;
      background: rgba(8,11,18,0.92);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(120,165,245,0.18);
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(140,185,255,0.22);
      color: #e8ecf4;
      min-width: 200px;
      pointer-events: none;
    ">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
        <span style="
          width:8px; height:8px; border-radius:50%;
          background:${dot}; box-shadow: 0 0 10px ${dot};
        "></span>
        <span style="font-weight:600; letter-spacing:-0.01em; color:#fff">${callsign}</span>
        <span style="color:#7b9cda; font-size:10.5px; letter-spacing:0.06em">${airlineCode}</span>
      </div>
      <div style="color:#a0aac3">${airlineName}${airlineName !== airlineCode ? "" : ""}</div>
      <div style="color:#5e6f93; font-size:11px">${country}</div>
      ${aircraftLine}
      <div style="color:${dot}; font-weight:500; margin-top:6px">${riskLabel}</div>
      <div style="
        margin-top:8px; padding-top:7px;
        border-top: 1px solid rgba(255,255,255,0.06);
        color:#7b9cda; font-size:11px;
        font-family: 'Geist Mono', ui-monospace, Menlo, monospace;
      ">
        ${first} → ${last} · ${t.points || 0} pts
      </div>
    </div>
  `;
}

export default function Earth({ flights = [], trajectories = [] }) {
  const globeRef = useRef(null);
  const wrapperRef = useRef(null);
  const [countries, setCountries] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 800 });
  const [hoveredIcao, setHoveredIcao] = useState(null);
  const isHovered = useCallback((t) => t && t.icao24 === hoveredIcao, [hoveredIcao]);

  // Material is constant, build it once.
  const globeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: new THREE.Color("#040810"),
        emissive: new THREE.Color("#020409"),
        emissiveIntensity: 1,
        shininess: 0,
      }),
    [],
  );

  // Resize observer — react-globe.gl needs explicit width/height.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  // Country polygons for the dotted continents look. Cached by the browser.
  useEffect(() => {
    fetch("/data/countries-110m.geojson", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d) => setCountries(d.features))
      .catch((e) => console.warn("countries load failed", e));
  }, []);

  // Hard-lock the camera on Europe + disable auto-rotate.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 48, lng: 12, altitude: 1.9 }, 0);
    const ctrl = g.controls();
    ctrl.autoRotate = false;
    ctrl.enableZoom = true;
    ctrl.minDistance = 180;
    ctrl.maxDistance = 600;
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.07;
  }, [countries]);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        animateIn={false}
        rendererConfig={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        globeMaterial={globeMaterial}
        showGlobe
        showAtmosphere
        atmosphereColor="#3273ff"
        atmosphereAltitude={0.18}
        /* Dotted continents */
        hexPolygonsData={countries || []}
        hexPolygonResolution={3}
        hexPolygonMargin={0.35}
        hexPolygonUseDots={true}
        hexPolygonColor={() => "rgba(170, 200, 235, 0.85)"}
        /* All flights' trajectories. Persistent ones (the climate-relevant
           signal) are highlighted in hot rose; everything else stays in
           a cool, low-opacity blue so the visual hierarchy is obvious.
           On hover, the highlighted track turns bright, thicker, glows, and
           lifts a touch higher so it visibly detaches from the rest. */
        pathsData={trajectories}
        pathPoints={(t) => t.coords}
        pathPointLat={(p) => p[1]}
        pathPointLng={(p) => p[0]}
        pathPointAlt={(p, i, all, t) => (isHovered(t) ? 0.075 : 0.05)}
        pathColor={(t) => {
          const hover = isHovered(t);
          if (isPersistent(t)) {
            return hover
              ? ["rgba(255, 180, 200, 0.85)", "rgba(255, 255, 255, 1)"]
              : ["rgba(255, 77, 109, 0.18)", "rgba(255, 77, 109, 0.95)"];
          }
          return hover
            ? ["rgba(200, 230, 255, 0.85)", "rgba(255, 255, 255, 1)"]
            : ["rgba(140, 195, 250, 0.18)", "rgba(140, 195, 250, 0.55)"];
        }}
        pathStroke={(t) => {
          if (isHovered(t)) return isPersistent(t) ? 2.6 : 2.2;
          return isPersistent(t) ? 1.4 : 1.1;
        }}
        pathTransitionDuration={0}
        pathLabel={trajectoryLabel}
        onPathHover={(t) => setHoveredIcao(t ? t.icao24 : null)}
      />
    </div>
  );
}

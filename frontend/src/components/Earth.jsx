import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

import { aircraftLabel, airlineLabel } from "../lib/icao.js";

/**
 * Earth — react-globe.gl dashboard map.
 *
 * Each airborne flight is rendered as an airplane-shaped SVG icon, rotated
 * by its current heading. Persistent contrail-forming flights are bigger,
 * hot rose, and slightly lifted; everything else is small and pale blue.
 *
 * Tooltip is custom (the html-elements layer has no built-in label hook —
 * we attach mouseenter/leave on each node and render a panel near the cursor).
 */
const COLOR_HOT = "#ff4d6d";
const COLOR_COLD = "#a8d2ff";
const isPersistent = (f) => f.risk === "persistent";

// Top-down airplane silhouette, nose pointing up (positive Y).
const PLANE_PATH =
  "M12 2 L11.6 9 L2 13 L2 14 L11.6 12.4 L11.6 18 L8.6 19.5 L8.6 20.5 L12 19.5 L15.4 20.5 L15.4 19.5 L12.4 18 L12.4 12.4 L22 14 L22 13 L12.4 9 Z";

function planeMarkup(f) {
  const persistent = isPersistent(f);
  const color = persistent ? COLOR_HOT : COLOR_COLD;
  const size = persistent ? 22 : 13;
  const glow = persistent ? 7 : 2.5;
  const heading = Number.isFinite(f.heading) ? f.heading : 0;
  const opacity = persistent ? 1 : 0.78;
  return `
    <div class="plane-marker" data-icao="${f.icao24}" style="
      width:${size}px; height:${size}px; cursor:pointer; pointer-events:auto;
      transform: rotate(${heading}deg);
      transform-origin: 50% 50%;
      transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
      will-change: transform;
    ">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block; opacity:${opacity}; filter: drop-shadow(0 0 ${glow}px ${color});">
        <path d="${PLANE_PATH}" fill="${color}"/>
      </svg>
    </div>
  `;
}

// Render the tooltip HTML (driven by hover state from <Earth>).
function tooltipMarkup(f) {
  const callsign = (f.callsign || f.icao24 || "—").trim();
  const airlineCode = (f.callsign || "").slice(0, 3).toUpperCase();
  const airlineName = airlineLabel(airlineCode);
  const country = f.country || "—";
  const persistent = isPersistent(f);
  const aircraftCode = f.aircraft_type;
  const aircraftHuman = aircraftCode ? aircraftLabel(aircraftCode) : null;
  const dot = persistent ? COLOR_HOT : "#78afe6";
  const riskLabel = persistent ? "Persistent contrail · now" : "No persistent contrail";

  const aircraftLine = aircraftHuman
    ? `<div style="color:#cfd9ff; margin-top:2px">${aircraftHuman}<span style="color:#5e6f93; font-size:10.5px; margin-left:6px">${aircraftCode}</span></div>`
    : "";

  const fl = f.alt_ft ? `FL${Math.round(f.alt_ft / 100)}` : null;
  const heading = Number.isFinite(f.heading) ? `${Math.round(f.heading)}°` : null;
  const flightLine = [fl, heading].filter(Boolean).join(" · ");

  return `
    <div style="
      font-family: Geist, -apple-system, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      padding: 10px 12px;
      background: rgba(8,11,18,0.95);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
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
      <div style="color:#a0aac3">${airlineName !== airlineCode ? airlineName : ""}</div>
      <div style="color:#5e6f93; font-size:11px">${country}</div>
      ${aircraftLine}
      ${flightLine ? `<div style="color:#cfd9ff; font-size:11px; margin-top:4px; font-family: 'Geist Mono', ui-monospace, monospace">${flightLine}</div>` : ""}
      <div style="color:${dot}; font-weight:500; margin-top:6px">${riskLabel}</div>
    </div>
  `;
}

export default function Earth({ flights = [] }) {
  const globeRef = useRef(null);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);
  const [countries, setCountries] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 800 });
  const flightsById = useMemo(() => {
    const m = new Map();
    for (const f of flights) m.set(f.icao24, f);
    return m;
  }, [flights]);

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

  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetch("/data/countries-110m.geojson", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d) => setCountries(d.features))
      .catch((e) => console.warn("countries load failed", e));
  }, []);

  // Tighter EU framing — was altitude 1.9.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 48, lng: 12, altitude: 1.45 }, 0);
    const ctrl = g.controls();
    ctrl.autoRotate = false;
    ctrl.enableZoom = true;
    ctrl.minDistance = 160;
    ctrl.maxDistance = 600;
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.07;
  }, [countries]);

  // Build a DOM node per flight. Attach hover handlers that drive the
  // tooltip overlay.
  const makeElement = useCallback(
    (f) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = planeMarkup(f);
      const node = wrapper.firstElementChild;

      const onEnter = (e) => {
        const tip = tooltipRef.current;
        if (!tip) return;
        tip.innerHTML = tooltipMarkup(flightsById.get(f.icao24) || f);
        tip.style.opacity = "1";
        positionTooltip(tip, e);
      };
      const onMove = (e) => {
        const tip = tooltipRef.current;
        if (!tip) return;
        positionTooltip(tip, e);
      };
      const onLeave = () => {
        const tip = tooltipRef.current;
        if (!tip) return;
        tip.style.opacity = "0";
      };
      node.addEventListener("mouseenter", onEnter);
      node.addEventListener("mousemove", onMove);
      node.addEventListener("mouseleave", onLeave);
      return node;
    },
    [flightsById],
  );

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
        hexPolygonsData={countries || []}
        hexPolygonResolution={3}
        hexPolygonMargin={0.35}
        hexPolygonUseDots={true}
        hexPolygonColor={() => "rgba(170, 200, 235, 0.85)"}
        /* Airplane icons */
        htmlElementsData={flights}
        htmlLat="lat"
        htmlLng="lon"
        htmlAltitude={(f) => (isPersistent(f) ? 0.018 : 0.005)}
        htmlElement={makeElement}
        htmlTransitionDuration={400}
      />

      {/* Custom tooltip overlay — positioned via the element hover handlers above. */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 100,
          opacity: 0,
          transition: "opacity 0.12s ease-out",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function positionTooltip(tip, e) {
  // Position to the upper-right of the cursor, but flip when close to edges.
  const offsetX = 14;
  const offsetY = -8;
  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX + offsetX;
  let y = e.clientY + offsetY - rect.height;
  if (x + rect.width > vw - 8) x = e.clientX - rect.width - offsetX;
  if (y < 8) y = e.clientY + offsetY + 18;
  if (y + rect.height > vh - 8) y = vh - rect.height - 8;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

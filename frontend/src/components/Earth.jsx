import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

/**
 * Earth — react-globe.gl dashboard map.
 *
 * Each airborne flight is rendered as an airplane-shaped SVG icon, rotated
 * by its current heading. Persistent contrail-forming flights are bigger,
 * hot rose, and slightly lifted; everything else is small and pale blue.
 *
 * Icons are pointer-events: none — drag/zoom passes through to the globe
 * canvas. (Hover tooltips were sacrificed for the rotation UX; revisit
 * later via a canvas-level raycast hit-test if needed.)
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
  const size = persistent ? 22 : 14;
  const glow = persistent ? 7 : 3;
  const heading = Number.isFinite(f.heading) ? f.heading : 0;
  const opacity = persistent ? 1 : 0.88;
  // Stagger delay derived from the last 4 hex digits of the icao24, so the
  // fleet appears in a deterministic-but-spread wave (0-900 ms).
  const hashSeed = parseInt((f.icao24 || "0").slice(-4), 16) || 0;
  const delayMs = (hashSeed % 900);
  // The OUTER wrapper is what react-globe.gl positions on the sphere — we
  // can't put our rotation there or it gets clobbered when the lib resets
  // `transform`. So we keep an inner div that handles the heading rotation.
  return `
    <div class="plane-marker" data-icao="${f.icao24}" style="
      width:${size}px; height:${size}px; pointer-events:none;
      animation: plane-fade-in 0.6s cubic-bezier(0.16,1,0.3,1) backwards;
      animation-delay: ${delayMs}ms;
    ">
      <div style="
        width:100%; height:100%;
        transform: rotate(${heading}deg);
        transform-origin: 50% 50%;
        transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
        will-change: transform;
      ">
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block; opacity:${opacity}; filter: drop-shadow(0 0 ${glow}px ${color});">
          <path d="${PLANE_PATH}" fill="${color}"/>
        </svg>
      </div>
    </div>
  `;
}

export default function Earth({ flights = [] }) {
  const globeRef = useRef(null);
  const wrapperRef = useRef(null);
  const [countries, setCountries] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 800 });

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

  // Build a DOM node per flight. No event listeners — icons are visual only,
  // pointer-events: none lets drag/zoom hit the canvas underneath.
  const makeElement = useCallback((f) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = planeMarkup(f);
    return wrapper.firstElementChild;
  }, []);

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
    </div>
  );
}

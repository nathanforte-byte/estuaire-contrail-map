import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

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
// Risk colour palette — drives both the legend in HeaderPanel and the markers.
const RISK_COLOR = {
  persistent: "#ff4d6d",
  short: "#e0a14a",
  none: "#6aa9c2",
  unknown: "#5b6472",
};
const RISK_RADIUS = {
  persistent: 0.22,
  short: 0.12,
  none: 0.07,
  unknown: 0.06,
};
const RISK_ALT = {
  persistent: 0.012,
  short: 0.006,
  none: 0.003,
  unknown: 0.003,
};

export default function Earth({ flights = [], trajectories = [] }) {
  const globeRef = useRef(null);
  const wrapperRef = useRef(null);
  const [countries, setCountries] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 800 });

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
        /* Flights — color, radius, and altitude scale with contrail risk so
           persistent (the hero signal) is bigger / brighter / lifted highest.
           When the user switches to "persistent only", the parent App passes
           a filtered list. */
        pointsData={flights}
        pointLat="lat"
        pointLng="lon"
        pointColor={(f) => RISK_COLOR[f.risk] || RISK_COLOR.unknown}
        pointAltitude={(f) => RISK_ALT[f.risk] ?? RISK_ALT.unknown}
        pointRadius={(f) => RISK_RADIUS[f.risk] ?? RISK_RADIUS.unknown}
        pointsMerge={true}
        /* Real trajectories — the 24 h "trail" view. Rendered in atmospheric
           blue so they read as historical context, while the rose dots above
           remain "right now". Gradient fades the origin and brightens toward
           the current tip — where the rose dot sits. */
        pathsData={trajectories}
        pathPoints={(t) => t.coords}
        pathPointLat={(p) => p[1]}
        pathPointLng={(p) => p[0]}
        pathPointAlt={0.05}
        pathColor={() => [
          "rgba(92, 161, 255, 0.10)",
          "rgba(92, 161, 255, 0.78)",
        ]}
        pathStroke={1.1}
        pathTransitionDuration={0}
      />
    </div>
  );
}

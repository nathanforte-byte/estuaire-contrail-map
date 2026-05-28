import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { EARTH_RADIUS } from "../lib/geo.js";

/**
 * Earth — strict data-grade aesthetic.
 *
 * No textures, no edge-detect rasters. Just:
 *   1. A near-black inner sphere (occluder + silhouette).
 *   2. Vector coastlines + country borders loaded as GeoJSON, projected
 *      directly to the sphere surface, rendered as LineSegments at 1 px.
 *   3. A faint dotted lat/lon grid every 30° (12 meridians, 5 parallels).
 *   4. The Atmosphere component handles the soft halo separately.
 */
export default function Earth() {
  return (
    <group>
      {/* Solid occluder (silhouette + back-face occlusion). */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 0.997, 96, 96]} />
        <meshBasicMaterial color="#03050a" />
      </mesh>

      <Grid radius={EARTH_RADIUS * 1.0008} />
      <VectorLines
        url="/data/countries-110m.geojson"
        radius={EARTH_RADIUS * 1.0014}
        color={0xffffff}
        opacity={0.62}
      />
    </group>
  );
}

// ── Vector lines from GeoJSON ────────────────────────────────────────────────

function VectorLines({ url, radius, color, opacity }) {
  const [geom, setGeom] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "force-cache" })
      .then((r) => r.json())
      .then((geo) => {
        if (cancelled) return;
        const positions = projectGeoJSON(geo, radius);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        setGeom(g);
      })
      .catch((e) => console.warn("vector load failed", url, e));
    return () => {
      cancelled = true;
    };
  }, [url, radius]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    [color, opacity],
  );

  if (!geom) return null;
  return <lineSegments geometry={geom} material={material} frustumCulled={false} />;
}

// Walk a GeoJSON FeatureCollection / Feature and project every ring/segment
// to a Float32Array of [x, y, z, x, y, z, ...] pairs ready for LineSegments.
function projectGeoJSON(geo, radius) {
  const out = [];

  const pushLine = (ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      // Subdivide long segments so they hug the sphere instead of cutting through.
      const segLen = Math.hypot(lon2 - lon1, lat2 - lat1);
      const subs = segLen > 4 ? Math.min(Math.ceil(segLen / 2), 12) : 1;
      for (let s = 0; s < subs; s++) {
        const ta = s / subs;
        const tb = (s + 1) / subs;
        const la = lat1 + (lat2 - lat1) * ta;
        const lo = lon1 + (lon2 - lon1) * ta;
        const lb = lat1 + (lat2 - lat1) * tb;
        const oo = lon1 + (lon2 - lon1) * tb;
        pushPoint(out, la, lo, radius);
        pushPoint(out, lb, oo, radius);
      }
    }
  };

  const walk = (geom) => {
    if (!geom) return;
    switch (geom.type) {
      case "Polygon":
        for (const ring of geom.coordinates) pushLine(ring);
        break;
      case "MultiPolygon":
        for (const poly of geom.coordinates) {
          for (const ring of poly) pushLine(ring);
        }
        break;
      case "LineString":
        pushLine(geom.coordinates);
        break;
      case "MultiLineString":
        for (const ring of geom.coordinates) pushLine(ring);
        break;
      default:
        break;
    }
  };

  if (geo.type === "FeatureCollection") {
    for (const f of geo.features) walk(f.geometry);
  } else if (geo.type === "Feature") {
    walk(geo.geometry);
  } else {
    walk(geo);
  }
  return out;
}

function pushPoint(arr, lat, lon, radius) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  arr.push(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  );
}

// ── Grid (dotted-feel via low-opacity short segments) ────────────────────────

function Grid({ radius }) {
  const { geometry } = useMemo(() => {
    const positions = [];

    // Parallels every 30° (excluding poles), high-res for smoothness
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue; // we'll draw the equator slightly thicker via a 2nd layer
      addCircle(positions, lat, "lat", radius, 128);
    }
    // Equator
    addCircle(positions, 0, "lat", radius, 192);

    // Meridians every 30°
    for (let lon = -150; lon <= 180; lon += 30) {
      addCircle(positions, lon, "lon", radius, 96);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return { geometry: g };
  }, [radius]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x1a2330,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    [],
  );

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

function addCircle(arr, deg, kind, radius, segments) {
  for (let i = 0; i < segments; i++) {
    const a = i / segments;
    const b = (i + 1) / segments;
    if (kind === "lat") {
      const lon1 = -180 + a * 360;
      const lon2 = -180 + b * 360;
      pushPoint(arr, deg, lon1, radius);
      pushPoint(arr, deg, lon2, radius);
    } else {
      const lat1 = -85 + a * 170;
      const lat2 = -85 + b * 170;
      pushPoint(arr, lat1, deg, radius);
      pushPoint(arr, lat2, deg, radius);
    }
  }
}

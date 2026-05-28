import * as THREE from "three";

// Earth radius in scene units. Keep small for fast OrbitControls dolly response.
export const EARTH_RADIUS = 1;

// WGS-84 lat/lon (degrees) → unit-sphere XYZ on a Y-up Earth at the given altitude
// offset (in scene units, defaults to surface). Matches the Three.js / R3F
// convention where +X is forward, +Y is up, lat=0 lon=0 points down +X.
//
// We use the same convention as Cesium/MapLibre: longitude rotates around the
// Y axis, latitude tilts up/down. Texture U=0 must map to longitude=-180 so
// the prime meridian lands on lon=0 with a standard equirectangular projection.
export function latLonToVec3(latDeg, lonDeg, altOffset = 0) {
  const r = EARTH_RADIUS + altOffset;
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const x = r * Math.cos(lat) * Math.cos(lon);
  const z = -r * Math.cos(lat) * Math.sin(lon);
  const y = r * Math.sin(lat);
  return new THREE.Vector3(x, y, z);
}

// Map an altitude in feet to a small radial offset above the sphere surface
// so flight markers visually sit slightly above the globe. The scale is
// intentionally exaggerated (typical cruise ~35 kft → ~+0.012 r) to be visible.
export function altFtToOffset(altFt) {
  if (!altFt || altFt < 0) return 0.002;
  // Cap at 50 kft. Quadratic so cruise stands out vs low-altitude noise.
  const clamped = Math.min(altFt, 50000) / 50000;
  return 0.003 + clamped * 0.012;
}

// Sample a great-circle path between two unit vectors at a given fraction.
export function slerp(v1, v2, t) {
  return v1.clone().lerp(v2, t).normalize();
}

// Build a 3D LineString from a list of {lat, lon, alt_ft} waypoints. Inserts
// intermediate slerped points between consecutive waypoints so the line hugs
// the sphere surface instead of cutting through the Earth on long segments.
export function trajectoryToVec3Array(waypoints, { segments = 6 } = {}) {
  if (!waypoints || waypoints.length < 2) return [];
  const out = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue;
    const offA = altFtToOffset(a.alt_ft);
    const offB = altFtToOffset(b.alt_ft);
    const va = latLonToVec3(a.lat, a.lon, offA);
    const vb = latLonToVec3(b.lat, b.lon, offB);

    // For very short segments don't subdivide.
    const distNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    const steps = distNm > 50 ? segments : 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // Slerp on a sphere of radius midRadius (avg of the two surface offsets).
      const midRadius = (EARTH_RADIUS + offA) * (1 - t) + (EARTH_RADIUS + offB) * t;
      const interp = va.clone().lerp(vb, t).setLength(midRadius);
      out.push(interp);
    }
  }
  // Always include the final waypoint.
  const last = waypoints[waypoints.length - 1];
  if (last.lat != null && last.lon != null) {
    out.push(latLonToVec3(last.lat, last.lon, altFtToOffset(last.alt_ft)));
  }
  return out;
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const R_NM = 3440.065;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(a));
}

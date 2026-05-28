import { useMemo } from "react";
import * as THREE from "three";

import { latLonToVec3, altFtToOffset, trajectoryToVec3Array } from "../lib/geo.js";

/**
 * Trajectories = one Line per persistent flight track.
 *
 * Coordinates come in as [[lon,lat], …]. We re-thread them into great-circle
 * 3D paths so the lines hug the sphere instead of cutting through it.
 *
 * Performance: a few hundred lines, each with ~100 vertices, is well under the
 * draw-call budget. We pre-build geometries once per data change.
 */
export default function Trajectories({ tracks }) {
  const geometries = useMemo(() => {
    return tracks.map((t) => {
      // Reconstruct waypoint objects expected by trajectoryToVec3Array.
      // We don't have per-waypoint altitude here (it was dropped when projecting
      // to [lon,lat] for GeoJSON), so use a constant cruise offset.
      const wps = t.coords.map(([lon, lat]) => ({
        lat, lon, alt_ft: 35000,
      }));
      const pts = trajectoryToVec3Array(wps, { segments: 4 });
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      return { id: t.icao24, geom };
    });
  }, [tracks]);

  // Single shared material — additive red glow.
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#ff2a5b"),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        linewidth: 1, // ignored on most platforms but kept for clarity
      }),
    [],
  );

  return (
    <group>
      {geometries.map(({ id, geom }) => (
        <line key={id} geometry={geom} material={material} frustumCulled={false} />
      ))}
    </group>
  );
}

import { useMemo } from "react";
import * as THREE from "three";

import { EARTH_RADIUS } from "../lib/geo.js";

/**
 * Atmosphere = a slightly larger back-side sphere with a fresnel-driven blue
 * shader. Renders as the soft halo around the Earth silhouette.
 *
 * Trick: by rendering only the back faces (Three.BackSide) with additive
 * blending and depth-write off, the shader colors only the visible rim of the
 * larger sphere — giving the bluish glow without occluding the Earth itself.
 */
const ATMOS_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMOS_FRAGMENT = /* glsl */ `
uniform vec3 sunDir;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.4);

  // Lit side gets a cyan-blue tint, dark side stays violet.
  float sunFacing = max(dot(normalize(vNormal), normalize(sunDir)), 0.0);
  vec3 dayTint = vec3(0.28, 0.55, 1.0);
  vec3 duskTint = vec3(0.45, 0.2, 0.55);
  vec3 col = mix(duskTint, dayTint, sunFacing);

  gl_FragColor = vec4(col * rim, rim);
}
`;

export default function Atmosphere() {
  const uniforms = useMemo(
    () => ({
      sunDir: { value: new THREE.Vector3(5, 2, 5).normalize() },
    }),
    [],
  );

  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS * 1.045, 64, 64]} />
      <shaderMaterial
        attach="material"
        uniforms={uniforms}
        vertexShader={ATMOS_VERTEX}
        fragmentShader={ATMOS_FRAGMENT}
        side={THREE.BackSide}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

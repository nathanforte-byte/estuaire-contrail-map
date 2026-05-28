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
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  // Single steel-blue tone, very subtle.
  vec3 col = vec3(0.32, 0.55, 0.85);
  gl_FragColor = vec4(col * rim * 0.55, rim * 0.55);
}
`;

export default function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS * 1.025, 64, 64]} />
      <shaderMaterial
        attach="material"
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

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

import { EARTH_RADIUS } from "../lib/geo.js";

/**
 * Earth = textured sphere with day map, night-lights overlay blended by the
 * surface lighting, plus a topology-derived bump map for relief.
 *
 * Textures are NASA Blue Marble / Black Marble derived, served from the
 * three-globe community library (MIT) at /public/textures so we don't depend
 * on any CDN. Three sources we use:
 *   - earth-blue-marble.jpg  (~5 MB)  → day diffuse
 *   - earth-night.jpg        (~3 MB)  → night-lights emissive
 *   - earth-topology.png     (~1 MB)  → bump (height-derived)
 *
 * We use a shader-material to blend day/night based on the dot product of the
 * surface normal and the light direction — that's what gives the smooth
 * terminator on the globe.
 */
const EARTH_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const EARTH_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D bumpMap;
uniform vec3 sunDir;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float bump = texture2D(bumpMap, vUv).r;

  // Cosine of angle between surface normal and the sun direction.
  // > 0: lit side, < 0: dark side. Smoothstep around the terminator.
  float cosA = dot(normalize(vNormal), normalize(sunDir));
  float dayMix = smoothstep(-0.12, 0.18, cosA);

  // Subtle terminator warmth (sunset glow) on the edge between day and night.
  float terminator = 1.0 - abs(cosA);
  vec3 sunsetTint = vec3(1.0, 0.45, 0.18) * pow(max(terminator - 0.6, 0.0), 2.0) * 0.5;

  // Boost night map a touch + clip oceans (they're near-black, no city lights).
  vec3 nightBoosted = night * 2.2;
  nightBoosted = clamp(nightBoosted, 0.0, 1.0);

  // Land bump → slight diffuse darkening so mountains show up.
  float relief = mix(0.85, 1.05, bump);

  vec3 finalColor = mix(nightBoosted, day * relief, dayMix) + sunsetTint;

  // Add a hint of atmospheric haze at grazing angles to soften the silhouette.
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
  finalColor += vec3(0.08, 0.18, 0.32) * fresnel * 0.15;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export default function Earth() {
  const meshRef = useRef();

  // Three textures from /public/textures (see scripts/fetch-textures).
  const [dayMap, nightMap, bumpMap] = useTexture([
    "/textures/earth-blue-marble.jpg",
    "/textures/earth-night.jpg",
    "/textures/earth-topology.png",
  ]);

  // Make sure colorspaces are right for the shader.
  dayMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.colorSpace = THREE.SRGBColorSpace;
  bumpMap.colorSpace = THREE.NoColorSpace;
  [dayMap, nightMap, bumpMap].forEach((t) => {
    t.anisotropy = 8;
    t.minFilter = THREE.LinearMipMapLinearFilter;
    t.magFilter = THREE.LinearFilter;
  });

  // Sun direction in world space. The directional light is at (5, 2, 5);
  // shader needs the normalized direction TOWARDS the light.
  const uniforms = useRef({
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    bumpMap: { value: bumpMap },
    sunDir: { value: new THREE.Vector3(5, 2, 5).normalize() },
  });

  // Earth slowly rotates around its tilted axis. Cumulative — independent
  // of the OrbitControls autoRotate (which moves the camera, not the globe).
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.018;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
      <shaderMaterial
        attach="material"
        uniforms={uniforms.current}
        vertexShader={EARTH_VERTEX_SHADER}
        fragmentShader={EARTH_FRAGMENT_SHADER}
      />
    </mesh>
  );
}

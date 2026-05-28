import { useEffect, useMemo, useRef, useState } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

import { EARTH_RADIUS } from "../lib/geo.js";

/**
 * Earth (plexus / data-constellation style).
 *
 * No photographic textures. Instead:
 *   1. A near-invisible inner sphere acts as the silhouette + occluder so
 *      flights on the back side don't bleed through.
 *   2. A second sphere runs an edge-detect shader on the land/water mask to
 *      glow thin white-cyan continent outlines.
 *   3. A points cloud, sampled from the same mask at a regular lat/lon grid,
 *      fills every continent with a uniform grid of luminous data dots.
 *
 * Mask source: `earth-water.png` (three-globe) — white = water, black = land.
 */
const OUTLINE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform sampler2D landMask;
uniform vec2 maskSize;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec2 px = 1.0 / maskSize;

  // Sample 4-neighbours for a cheap Sobel-ish edge.
  float c  = texture2D(landMask, vUv).r;
  float l  = texture2D(landMask, vUv - vec2(px.x, 0.0)).r;
  float r  = texture2D(landMask, vUv + vec2(px.x, 0.0)).r;
  float u  = texture2D(landMask, vUv - vec2(0.0, px.y)).r;
  float d  = texture2D(landMask, vUv + vec2(0.0, px.y)).r;
  // Diagonals for thicker, smoother coastlines
  float ul = texture2D(landMask, vUv - vec2(px.x, px.y)).r;
  float ur = texture2D(landMask, vUv + vec2(px.x, -px.y)).r;
  float dl = texture2D(landMask, vUv + vec2(-px.x, px.y)).r;
  float dr = texture2D(landMask, vUv + vec2(px.x, px.y)).r;

  float edge = abs(c - l) + abs(c - r) + abs(c - u) + abs(c - d)
             + 0.5 * (abs(c - ul) + abs(c - ur) + abs(c - dl) + abs(c - dr));
  float outline = smoothstep(0.18, 0.55, edge);

  // Slight rim darkening so the outline fades at extreme grazing angles.
  float face = max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0);
  float rim = smoothstep(0.0, 0.25, face);

  vec3 base = vec3(0.92, 0.97, 1.0);
  vec3 cyan = vec3(0.46, 0.78, 1.0);
  vec3 col = mix(base, cyan, 0.35);

  gl_FragColor = vec4(col * outline * rim, outline * rim);
}
`;

export default function Earth() {
  const [mask] = useTexture(["/textures/earth-water.png"]);
  mask.colorSpace = THREE.NoColorSpace;
  mask.minFilter = THREE.LinearFilter;
  mask.magFilter = THREE.LinearFilter;
  mask.anisotropy = 4;

  const uniforms = useMemo(
    () => ({
      landMask: { value: mask },
      maskSize: { value: new THREE.Vector2(2048, 1024) },
    }),
    [mask],
  );

  // Update mask size once the image is actually loaded.
  useEffect(() => {
    if (mask.image) {
      uniforms.maskSize.value.set(mask.image.width, mask.image.height);
    }
  }, [mask, uniforms]);

  return (
    <group>
      {/* Solid occluder so back-side flights don't bleed through */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 0.995, 64, 64]} />
        <meshBasicMaterial color="#020306" />
      </mesh>

      {/* Equator + meridian grid (very faint) */}
      <Grid radius={EARTH_RADIUS * 1.0005} />

      {/* Land dots */}
      <LandDots mask={mask} />

      {/* Continent outlines */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.002, 256, 256]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={OUTLINE_VERTEX}
          fragmentShader={OUTLINE_FRAGMENT}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function LandDots({ mask }) {
  const [data, setData] = useState(null);
  const meshRef = useRef();

  // Sample the land mask once it loads. Land = mask < threshold (white = water).
  useEffect(() => {
    const img = mask.image;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

    // 1.4° lat × 1.4° lon = ~26 000 samples → ~10 000 land hits
    const STEP_LAT = 1.4;
    const STEP_LON = 1.4;
    const out = [];

    for (let lat = -82; lat <= 82; lat += STEP_LAT) {
      for (let lon = -180; lon < 180; lon += STEP_LON) {
        const u = (lon + 180) / 360;
        const v = 1 - (lat + 90) / 180;
        const px = Math.min(Math.floor(u * img.width), img.width - 1);
        const py = Math.min(Math.floor(v * img.height), img.height - 1);
        const idx = (py * img.width + px) * 4;
        const r = pixels[idx];
        // Mask is white-on-water: land where pixel is dark.
        if (r < 120) {
          const phi = (lat * Math.PI) / 180;
          const theta = (lon * Math.PI) / 180;
          const radius = EARTH_RADIUS * 1.003;
          const x = radius * Math.cos(phi) * Math.cos(theta);
          const z = -radius * Math.cos(phi) * Math.sin(theta);
          const y = radius * Math.sin(phi);
          out.push(x, y, z);
        }
      }
    }

    setData(new Float32Array(out));
  }, [mask]);

  if (!data || data.length === 0) return null;

  return (
    <points ref={meshRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[data, 3]}
          count={data.length / 3}
          array={data}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={DOT_VERTEX}
        fragmentShader={DOT_FRAGMENT}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

const DOT_VERTEX = /* glsl */ `
varying float vFacing;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Compare the world-space normal (= normalized position) against the camera
  // direction so we can fade out dots that wrap to the far side of the globe.
  vec3 worldNormal = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec3 camDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
  vFacing = max(dot(worldNormal, camDir), 0.0);

  gl_Position = projectionMatrix * mv;
  gl_PointSize = 2.1;
}
`;

const DOT_FRAGMENT = /* glsl */ `
varying float vFacing;
void main() {
  // Disc with soft edge
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.2, d);
  // Fade back side
  float facing = smoothstep(0.05, 0.55, vFacing);
  vec3 col = mix(vec3(0.45, 0.75, 1.0), vec3(0.85, 0.95, 1.0), facing);
  gl_FragColor = vec4(col, a * facing * 0.95);
}
`;

/**
 * Subtle latitude/longitude grid — wireframe sphere drawn as lines at every
 * 30°. Keeps the data-globe legibility without overwhelming the dots.
 */
function Grid({ radius }) {
  const { geometry } = useMemo(() => {
    const positions = [];

    // Parallels (constant lat)
    for (let lat = -60; lat <= 60; lat += 30) {
      const segs = 96;
      for (let i = 0; i < segs; i++) {
        const lon1 = (-180 + (i / segs) * 360);
        const lon2 = (-180 + ((i + 1) / segs) * 360);
        pushLatLon(positions, lat, lon1, radius);
        pushLatLon(positions, lat, lon2, radius);
      }
    }
    // Meridians (constant lon)
    for (let lon = -150; lon <= 180; lon += 30) {
      const segs = 64;
      for (let i = 0; i < segs; i++) {
        const lat1 = -85 + (i / segs) * 170;
        const lat2 = -85 + ((i + 1) / segs) * 170;
        pushLatLon(positions, lat1, lon, radius);
        pushLatLon(positions, lat2, lon, radius);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return { geometry: geom };
  }, [radius]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x223044,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    [],
  );

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

function pushLatLon(arr, lat, lon, radius) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  arr.push(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  );
}

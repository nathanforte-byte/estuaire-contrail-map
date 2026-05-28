import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { latLonToVec3, altFtToOffset } from "../lib/geo.js";

const RISK_COLOR = {
  persistent: new THREE.Color("#d63556"),
  short: new THREE.Color("#b88336"),
  none: new THREE.Color("#5896b3"),
  unknown: new THREE.Color("#5b6472"),
};

/**
 * Flights = one points cloud for ALL aircraft, plus a separate halo points
 * cloud for the persistent subset (the hero signal).
 *
 * We use Points + BufferGeometry so 3k+ aircraft remain a single draw call.
 */
export default function Flights({ flights }) {
  const pointsRef = useRef();
  const haloRef = useRef();

  const { positions, colors, sizes, persistentPositions } = useMemo(() => {
    const pos = new Float32Array(flights.length * 3);
    const col = new Float32Array(flights.length * 3);
    const siz = new Float32Array(flights.length);
    const persistent = [];

    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      const off = altFtToOffset(f.alt_ft);
      const v = latLonToVec3(f.lat, f.lon, off);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;

      const c = RISK_COLOR[f.risk] || RISK_COLOR.unknown;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      siz[i] =
        f.risk === "persistent" ? 11.0 :
        f.risk === "short" ? 8.0 :
        5.5;

      if (f.risk === "persistent") {
        persistent.push(v.x, v.y, v.z);
      }
    }
    return {
      positions: pos,
      colors: col,
      sizes: siz,
      persistentPositions: new Float32Array(persistent),
    };
  }, [flights]);

  // Gentle pulse on the persistent halos.
  useFrame((state) => {
    if (haloRef.current) {
      const t = state.clock.elapsedTime;
      const m = haloRef.current.material;
      m.size = 26 + Math.sin(t * 2.0) * 4;
      m.opacity = 0.38 + Math.sin(t * 2.0) * 0.1;
    }
  });

  return (
    <group>
      {/* Halo for persistent — bigger, pulsing, additive. Drawn first so dots sit on top. */}
      {persistentPositions.length > 0 && (
        <points ref={haloRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[persistentPositions, 3]}
              count={persistentPositions.length / 3}
              array={persistentPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            size={24}
            color="#d63556"
            transparent
            opacity={0.4}
            sizeAttenuation={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={colors.length / 3}
            array={colors}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[sizes, 1]}
            count={sizes.length}
            array={sizes}
            itemSize={1}
          />
        </bufferGeometry>
        <shaderMaterial
          attach="material"
          uniforms={{}}
          vertexShader={DOT_VERTEX}
          fragmentShader={DOT_FRAGMENT}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

const DOT_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size;
}
`;

const DOT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  // Disc with soft edge.
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.35, d);
  gl_FragColor = vec4(vColor, a);
}
`;

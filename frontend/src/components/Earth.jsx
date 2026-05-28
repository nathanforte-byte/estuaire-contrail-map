import createGlobe from "cobe";
import { useEffect, useRef } from "react";

/**
 * Earth — small WebGL globe via `cobe`. Auto-rotates slowly, markers fed from
 * outside (persistent-contrail flights only).
 *
 * Cobe is ~3.5KB; it draws a dotted earth + bright markers + glow in one
 * canvas pass. We center the camera around Europe (theta=0.35, initial phi
 * picks up roughly +10° longitude).
 */
export default function Earth({ markers = [] }) {
  const canvasRef = useRef(null);
  const phiRef = useRef(0);
  const pointerRef = useRef({ x: 0 });
  const pointerStartRef = useRef(null);
  const offsetRef = useRef(0);

  // Holding the latest markers in a ref so onRender can read them without
  // restarting the globe on every snapshot.
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let width = 0;
    const onResize = () => {
      width = canvasRef.current?.offsetWidth ?? 0;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.32,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      // Blue/black aesthetic to match the stage glow.
      baseColor: [0.18, 0.22, 0.32],
      markerColor: [1, 0.34, 0.45],
      glowColor: [0.2, 0.45, 1],
      markers: markersRef.current,
      opacity: 1,
      offset: [0, 0],
      onRender: (state) => {
        // Slow continuous rotation centered around Europe.
        state.phi = -2.1 + phiRef.current + offsetRef.current;
        phiRef.current += 0.0035;
        state.markers = markersRef.current;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = "1";
    });

    // Drag to spin further (no library, just track x deltas).
    const el = canvasRef.current;
    const onDown = (e) => {
      pointerStartRef.current = e.clientX || e.touches?.[0].clientX;
      el.style.cursor = "grabbing";
    };
    const onMove = (e) => {
      if (pointerStartRef.current == null) return;
      const x = e.clientX || e.touches?.[0].clientX;
      const delta = (x - pointerStartRef.current) / 150;
      offsetRef.current = delta * Math.PI;
    };
    const onUp = () => {
      if (pointerStartRef.current == null) return;
      // Bake the drag into phi so the next drag continues from the new pos.
      phiRef.current += offsetRef.current;
      offsetRef.current = 0;
      pointerStartRef.current = null;
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]">
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          opacity: 0,
          transition: "opacity 1.2s ease",
          cursor: "grab",
          touchAction: "none",
          contain: "layout paint size",
        }}
      />
    </div>
  );
}

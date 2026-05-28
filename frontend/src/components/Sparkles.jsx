import { useEffect, useRef } from "react";

/**
 * Sparkles — lightweight canvas particle field. Hand-rolled (no tsparticles
 * dependency) since we only need a directional drift + soft fade.
 *
 * Props mirror the magicui/sparkles API:
 *   density: target particle count (auto-scales by canvas area)
 *   speed: average vertical speed (px/frame * 60fps reference)
 *   size: max radius
 *   direction: 'top' | 'bottom' | 'left' | 'right'
 *   opacitySpeed: how fast opacity oscillates (lower = slower twinkle)
 *   color: hex string
 */
export default function Sparkles({
  density = 600,
  speed = 1,
  size = 1.2,
  direction = "top",
  opacitySpeed = 2,
  color = "#ffffff",
  className,
}) {
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0;
    let H = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-seed particle count based on actual canvas area, so density is
      // visually consistent across viewports.
      const targetCount = Math.round((W * H) / (1200 * 1200) * density);
      particles.current = new Array(targetCount).fill(0).map(() => makeParticle(W, H));
    };

    const makeParticle = (w, h) => {
      const r = Math.random() * size + 0.3;
      // Start: spread across the spawn edge; pick a random life so we don't see
      // a "wall" of particles starting at the same row.
      const x = Math.random() * w;
      const y = Math.random() * h;
      const sp = (Math.random() * 0.5 + 0.5) * speed;
      return {
        x,
        y,
        r,
        speed: sp,
        phase: Math.random() * Math.PI * 2,
        twinkle: Math.random() * 0.4 + 0.1,
      };
    };

    const step = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      const t = performance.now() * 0.001 * opacitySpeed;
      for (const p of particles.current) {
        // Move along the requested direction.
        if (direction === "top") p.y -= p.speed * 0.6;
        else if (direction === "bottom") p.y += p.speed * 0.6;
        else if (direction === "left") p.x -= p.speed * 0.6;
        else if (direction === "right") p.x += p.speed * 0.6;

        // Slight horizontal drift for vertical directions.
        if (direction === "top" || direction === "bottom") {
          p.x += Math.sin((p.y + p.phase * 100) * 0.01) * 0.18;
        }

        // Wrap.
        if (p.y < -10) {
          p.y = H + 10;
          p.x = Math.random() * W;
        }
        if (p.y > H + 10) {
          p.y = -10;
          p.x = Math.random() * W;
        }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;

        // Twinkle.
        const alpha = Math.max(
          0,
          Math.min(1, 0.4 + Math.sin(t + p.phase) * p.twinkle),
        );
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(step);
    };

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [density, speed, size, direction, opacitySpeed, color]);

  return <canvas ref={canvasRef} className={className} />;
}

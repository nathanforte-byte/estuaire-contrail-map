import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Force a single Three.js copy across the bundle. globe.gl ships its own
  // nested copy which otherwise breaks react-globe.gl's projection logic
  // (isBehindGlobe reads the camera state, which would belong to the wrong
  // THREE instance, leaving every html marker stuck at the viewport centre).
  resolve: {
    dedupe: ["three", "react", "react-dom"],
  },
  optimizeDeps: {
    include: ["three"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: { outDir: "dist", assetsInlineLimit: 0 },
});

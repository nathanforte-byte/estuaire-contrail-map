import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel's Python runtime serves /api/* via the api/ directory; Vite only
// builds the static + JS bundle. The dev proxy below lets `vite dev` hit a
// local uvicorn on :8000 while looking same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0, // textures must stay as files, never inlined
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
});

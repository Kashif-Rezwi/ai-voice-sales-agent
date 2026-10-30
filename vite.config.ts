import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000";
const clientPort = Number(process.env.VITE_PORT ?? 5173);

export default defineConfig({
  root: path.join(projectRoot, "client"),
  plugins: [react()],
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  build: {
    outDir: path.join(projectRoot, "dist", "client"),
    emptyOutDir: true,
  },
});

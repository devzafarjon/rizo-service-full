import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Point the dev proxy at another API (e.g. a scratch database) with API_TARGET=http://localhost:4100.
const api = process.env.API_TARGET ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  server: {
    port: Number(process.env.DEV_PORT ?? 5173),
    proxy: {
      "/api": api,
      "/uploads": api,
      "/socket.io": {
        target: api,
        ws: true,
      },
    },
  },
});

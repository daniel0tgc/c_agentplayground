import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/skill.md": "http://localhost:8000",
      "/heartbeat.md": "http://localhost:8000",
      "/skill.json": "http://localhost:8000",
    },
  },
});

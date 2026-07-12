import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  plugins: [react(), yaml()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      "/api": {
        target: "http://x-server.local:5000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://x-server.local:5000",
        changeOrigin: true,
      },
    },
    allowedHosts: ["x-server.local"]
  },
});

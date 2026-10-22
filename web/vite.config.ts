import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiProxy } from "./src/api-proxy.ts";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy(process.env["API_TARGET"]),
  },
  build: {
    outDir: "dist",
  },
});

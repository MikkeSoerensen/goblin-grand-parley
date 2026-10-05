import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true, // all interfaces (IPv4 + IPv6), so friends on the LAN can connect
    port: 8080,
    hmr: { overlay: false },
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true, changeOrigin: true },
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});

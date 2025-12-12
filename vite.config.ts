import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force a single React and React‑DOM instance for the whole bundle
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    // Deduplicate any peer dependencies that might otherwise bundle their own copy
    dedupe: [
      "react",
      "react-dom",
      "react-router-dom",
      "wagmi",
      "@tanstack/react-query",
    ],
  },
  // Pre‑bundle the core React packages so Vite never creates a second copy
  optimizeDeps: {
    include: ["react", "react-dom"],
    force: true,
  },
}));
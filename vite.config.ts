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
      // Ensure a single React instance for the whole bundle
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    // Deduplicate peer dependencies that might otherwise bundle another copy
    dedupe: ["react", "react-dom"],
  },
  // Pre‑bundle React and React‑DOM so Vite never creates a second copy
  optimizeDeps: {
    include: ["react", "react-dom"],
    force: true,
  },
}));
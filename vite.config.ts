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
      // Always resolve to the single React copy in the root node_modules
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),

      // Shortcut for project source files
      "@": path.resolve(__dirname, "./src"),
    },

    // Deduplicate every library that may depend on React
    dedupe: [
      "react",
      "react-dom",
      // Routing
      "react-router",
      "react-router-dom",
      // State & data fetching
      "@tanstack/react-query",
      "@tanstack/query-core",
      // Wallet / blockchain
      "wagmi",
      "@wagmi/core",
      "@wagmi/connectors",
      // Supabase auth UI (if used)
      "@supabase/auth-ui-react",
      "@supabase/auth-ui-shared",
      // Radix UI components (all peer on React)
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-form",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-input",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-sheet",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      // Shadcn UI namespace (all components share React)
      "@/components/ui",
    ],
  },

  // Pre‑bundle React and React‑DOM so Vite never creates a second copy
  optimizeDeps: {
    include: ["react", "react-dom"],
    force: true,
  },

  // Ensure the same behaviour for SSR / production builds
  ssr: {
    external: ["react", "react-dom"],
  },
}));
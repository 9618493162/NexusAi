import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Root build by default; set VITE_BASE (e.g. /NexusAi/) for subpath deploys
  // like GitHub Pages. import.meta.env.BASE_URL reflects this value.
  base: process.env.VITE_BASE || "/",
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy shared vendors into cacheable chunks so no single
        // route chunk (e.g. Chat's react-markdown + react-syntax-highlighter
        // prism bundle) blows past the 500 kB warning threshold.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "zustand"],
          motion: ["framer-motion"],
          markdown: ["react-markdown", "react-syntax-highlighter"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
          radix: [
            "@radix-ui/react-avatar",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slot",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
})

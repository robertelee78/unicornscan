import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Code splitting for production builds
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          react: ['react', 'react-dom', 'react-router-dom'],
          // UI components (Radix)
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-label',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
          ],
          // Charts and visualization
          charts: ['recharts', 'd3'],
          // Maps
          maps: ['leaflet', 'react-leaflet'],
          // Export functionality
          export: ['jspdf', 'jspdf-autotable', 'html2canvas', 'file-saver', 'jszip'],
          // Database client
          postgrest: ['@supabase/postgrest-js'],
          // Data fetching
          query: ['@tanstack/react-query'],
                  },
      },
    },
    // Increase chunk size warning limit (after splitting, chunks should be smaller)
    chunkSizeWarningLimit: 600,
  },
})

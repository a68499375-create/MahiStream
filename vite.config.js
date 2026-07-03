import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    // Minifikasi lebih agresif untuk bundle lebih kecil → load lebih cepat
    minify: 'terser',
    terserOptions: {
      compress: {
        // Strip console.log/warn/info di production bundle supaya log
        // GoogleAuth, Capacitor plugins, dan debug noise lain tidak
        // muncul di logcat Android atau DevTools. Tetap pertahankan
        // console.error supaya crash report tetap kelihatan.
        drop_console: ['log', 'warn', 'info', 'debug', 'trace'],
        drop_debugger: true,
        passes: 2,
      },
    },
    // Split chunks supaya vendor libraries di-cache terpisah oleh browser
    // Vite 8 (Rolldown) butuh manualChunks sebagai function
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/hls.js')) {
            return 'player';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
        },
      },
    },
    // Target modern browsers untuk bundle lebih kecil
    target: 'es2020',
    chunkSizeWarningLimit: 600,
  },
})

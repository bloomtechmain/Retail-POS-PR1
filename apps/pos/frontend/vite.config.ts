import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Overridable for local dev when the default backend port is already taken
// by something else on the machine (e.g. another project) — unset, this is
// unchanged from before.
const backendPort = process.env.VITE_BACKEND_PORT || '5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/downloads': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand'],
        },
      },
    },
  },
});

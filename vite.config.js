import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Silence chunk-size warnings for firebase bundle
    chunkSizeWarningLimit: 1000,
  },
});
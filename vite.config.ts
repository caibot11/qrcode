import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // TV display page
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // laptop scan page
        scan: fileURLToPath(new URL('./scan.html', import.meta.url)),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});

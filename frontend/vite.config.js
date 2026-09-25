import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3000',
      '/gateway': 'http://localhost:3000',
      '/apps': 'http://localhost:3000',
      '/manifest.webmanifest': 'http://localhost:3000',
    },
  },
});

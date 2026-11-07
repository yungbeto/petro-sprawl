// The 404 page (404.html, src/notFound.tsx), built on its own after the app, into the same dist/. As a second
// input of the app's build it shared chunks with the app, and the map never drew in production (2026-11-07):
// MapLibre broke once split across chunks. A separate build leaves the app's chunks exactly as they were.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: { input: '404.html' },
  },
});

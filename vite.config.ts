import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Two pages: the app, and the 404 page Vercel serves for any path the build doesn't have.
  build: {
    rollupOptions: {
      input: { main: 'index.html', notFound: '404.html' },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

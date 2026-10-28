import { defineConfig } from '@playwright/test';

const PORT = 5287;

export default defineConfig({
  testDir: 'tests/e2e',
  // The first request on a cold dev server waits for dependency pre-bundling.
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});

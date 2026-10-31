import { defineConfig, devices } from '@playwright/test';

const PORT = 5287;

export default defineConfig({
  testDir: 'tests/e2e',
  // The first request on a cold dev server waits for dependency pre-bundling.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    // Headless Chromium renders WebGL in software by default: about 1 fps with the pipeline
    // layer, so camera animations never settle. Use the GPU on macOS. CI without a GPU needs another plan.
    launchOptions:
      process.platform === 'darwin' ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {},
  },
  projects: [
    { name: 'desktop', testMatch: 'smoke.spec.ts' },
    // The phone layout (below MOBILE.maxWidthPx): an iPhone's screen and touch, in Chromium for the GPU flags above.
    { name: 'phone', testMatch: 'phone.spec.ts', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});

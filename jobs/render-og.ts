// Manual: the social sharing card, a still frame of the header globe beside the app's name, rendered in
// Chromium (Playwright, from the smoke tests) -> public/og.png, 1200 x 630.
// Run: npm run render:og (after import:globe when the land mask changes)

import { chromium } from '@playwright/test';
import { GLOBE } from '../src/lib/config';
import { globeFrame, globeSvg } from '../src/lib/globe';
import { GLOBE_LAND } from '../src/lib/globeLand';

const OUT = 'public/og.png';
const { dots, lon, fill, oceanOpacity, px } = GLOBE.og;
const svg = globeSvg({ frame: globeFrame({ mask: GLOBE_LAND, dots, lon, tilt: GLOBE.tilt }), dots, fill, oceanOpacity });

const html = `<!doctype html>
<html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Inter:wght@400;500&display=block" />
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #f4f4f2; color: #17191c; font-family: Inter, sans-serif; }
  .text { position: absolute; left: 80px; top: 0; bottom: 0; width: 540px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
  h1 { font-size: 88px; font-weight: 500; letter-spacing: -0.045em; line-height: 1; }
  p { font-size: 28px; line-height: 1.4; color: #5f646b; letter-spacing: -0.01em; }
  .url { position: absolute; left: 80px; bottom: 56px; font: 400 20px 'IBM Plex Mono', monospace; color: #5f646b; }
  .globe { position: absolute; right: 72px; top: ${(630 - px) / 2}px; width: ${px}px; height: ${px}px; }
  .globe svg { width: 100%; height: 100%; display: block; }
</style></head>
<body>
  <div class="text">
    <h1>Petro Sprawl</h1>
    <p>The world's oil and gas pipelines, LNG terminals, chokepoints and basins, with the flows measured through them.</p>
  </div>
  <div class="url">petrosprawl.fyi</div>
  <div class="globe">${svg}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate('document.fonts.ready');
await page.screenshot({ path: OUT });
await browser.close();
console.log(`og: ${dots} dots across, centred on ${lon}° -> ${OUT}`);

// Manual: footage of the real app for the demo video (video/, Remotion). Playwright drives the dev server in
// Chromium on the GPU with a drawn cursor; Chrome's screencast frames are joined by ffmpeg into
// demo/footage.mp4 (1920 x 1080, 30 fps, real speed). demo/beats.json says when each scene starts and which
// part of the screen to zoom into, in seconds from the footage's start and CSS pixels, for the edit.
// Needs ffmpeg on the PATH. Run: npm run record:demo, then npm run video (Studio) or npm run video:render.

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';

const PORT = 5288;
const BASE = `http://localhost:${PORT}`;
const DIR = 'demo';
const FRAMES = join(DIR, 'frames');
// 1280 x 720 CSS pixels at 1.5x: the desktop layout, filmed at 1080p.
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5;
const FPS = 30;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Beats {
  viewport: { width: number; height: number };
  /** Seconds of footage. */
  duration: number;
  /** Scene starts, in order; each runs until the next, the last until `duration`. */
  scenes: { id: string; at: number }[];
  /** A part of the screen to move in on, from `from` to `to`. */
  zooms: { id: string; from: number; to: number; rect: Rect }[];
}

// The cursor and its press ring: headless Chromium draws neither.
const CURSOR = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="#17191c" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', transition: 'scale 120ms' });
  document.body.appendChild(c);
  addEventListener('mousemove', (e) => { c.style.left = e.clientX - 3 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
  addEventListener('mousedown', (e) => {
    c.style.scale = '0.9';
    const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: e.clientX - 16 + 'px', top: e.clientY - 16 + 'px', width: '32px', height: '32px', borderRadius: '50%', border: '2px solid rgba(23,25,28,0.45)', zIndex: 2147483646, pointerEvents: 'none', transition: 'scale 400ms ease-out, opacity 400ms ease-out', scale: '0.4' });
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.scale = '1.3'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 450);
  }, true);
  addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
});`;

let mouse = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.55 };

/** Glides the cursor to a point, easing in and out, like a hand on a trackpad. */
async function glide(page: Page, x: number, y: number, ms = 700) {
  const from = mouse;
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await page.waitForTimeout(16);
  }
  mouse = { x, y };
}

async function clickOn(page: Page, locator: Locator, ms?: number) {
  await locator.waitFor({ state: 'visible' });
  const box = (await locator.boundingBox())!;
  await glide(page, box.x + Math.min(box.width / 2, 60), box.y + box.height / 2, ms);
  await page.waitForTimeout(150);
  await press(page);
}

async function press(page: Page) {
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

/** Where a longitude and latitude are on screen. */
async function onMap(page: Page, lonLat: [number, number]) {
  const local = await page.evaluate(
    (p) => (globalThis as unknown as { __etMap: { project(p: [number, number]): { x: number; y: number } } }).__etMap.project(p),
    lonLat,
  );
  const box = (await page.locator('.map__canvas').boundingBox())!;
  return { x: box.x + local.x, y: box.y + local.y };
}

async function type(page: Page, text: string) {
  for (const ch of text) await page.keyboard.type(ch), await page.waitForTimeout(70 + Math.random() * 60);
}

const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Waits for the map's camera and tiles to come to rest. */
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const map = (globalThis as unknown as { __etMap?: { loaded(): boolean; isMoving(): boolean } }).__etMap;
    return map?.loaded() && !map.isMoving();
  }, undefined, { timeout: 20_000 });
}

/** The box around some elements, with room around it. */
async function around(locators: Locator[], pad = 12): Promise<Rect> {
  const boxes = (await Promise.all(locators.map((l) => l.boundingBox()))).filter((b) => b !== null);
  const x = Math.min(...boxes.map((b) => b.x)) - pad;
  const y = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x, y, width: right - x, height: bottom - y };
}

async function tour(page: Page, now: () => number, beats: Beats) {
  const scene = (id: string) => beats.scenes.push({ id, at: now() });
  const rail = page.getByRole('navigation', { name: 'Views' });
  const panel = page.getByLabel('Panel', { exact: true });
  // A scene starts as its action does: the click, or the search opening.
  const search = async (text: string, id?: string) => {
    await clickOn(page, page.getByRole('search').getByRole('button', { name: /^Search/ }));
    if (id) scene(id);
    await hold(page, 300);
    await type(page, text);
    await hold(page, 700);
  };

  // Home: the summary of what's disrupted.
  await page.goto(BASE);
  await page.getByRole('region', { name: 'Overview' }).waitFor();
  await settle(page);
  await hold(page, 600);
  scene('home');
  await hold(page, 3000);

  // Chokepoints, then Hormuz: its tanker transits against the five-year average.
  await clickOn(page, rail.getByRole('button', { name: 'Chokepoints' }));
  scene('chokepoints');
  await settle(page);
  await hold(page, 1500);
  await clickOn(page, panel.getByRole('button', { name: /^Strait of Hormuz/ }));
  const heading = panel.getByRole('heading', { name: 'Strait of Hormuz' });
  await heading.waitFor();
  await settle(page);
  await hold(page, 400);
  const figure = await around([heading, panel.getByRole('img', { name: /Daily tanker transits/ })]);
  const zoomFrom = now();
  await hold(page, 3200);
  beats.zooms.push({ id: 'hormuz', from: zoomFrom, to: now(), rect: figure });
  await hold(page, 600);

  // A pipeline by name: TurkStream's measured gas flow.
  await search('turkstream', 'pipeline');
  await page.keyboard.press('Enter');
  await panel.getByRole('heading', { name: 'TurkStream' }).waitFor();
  await settle(page);
  await hold(page, 1200);
  const chart = panel.getByRole('img', { name: /Daily physical gas flow for TurkStream/ });
  await chart.scrollIntoViewIfNeeded();
  await hold(page, 300);
  const chartFrom = now();
  const box = (await chart.boundingBox())!;
  await glide(page, box.x + box.width * 0.25, box.y + box.height * 0.5, 700);
  await glide(page, box.x + box.width * 0.9, box.y + box.height * 0.5, 2000);
  await hold(page, 500);
  beats.zooms.push({ id: 'flow', from: chartFrom, to: now(), rect: await around([chart], 40) });
  await hold(page, 500);

  // Basins: West Siberia, and the pipelines that cross it.
  await clickOn(page, rail.getByRole('button', { name: 'Basins' }));
  scene('basin');
  await settle(page);
  await hold(page, 800);
  // Straight on the map: hover West Siberia for its name, then click it.
  const siberia = await onMap(page, [73, 61]);
  await glide(page, siberia.x, siberia.y, 1100);
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'West Siberian Basin' });
  await tooltip.waitFor();
  const hoverFrom = now();
  const hovered = await around([tooltip], 90);
  await hold(page, 1600);
  await press(page);
  beats.zooms.push({ id: 'hover', from: hoverFrom, to: now(), rect: hovered });
  await panel.getByRole('heading', { name: 'West Siberian Basin' }).waitFor();
  await settle(page);
  await hold(page, 3500);

  // Where is my oil from: a ZIP code opens its region, gasoline then crude.
  await search('90012', 'zip');
  await page.keyboard.press('Enter');
  await panel.getByRole('heading', { name: 'West Coast' }).waitFor();
  await settle(page);
  await hold(page, 2200);
  await clickOn(page, panel.getByRole('tab', { name: 'Crude' }));
  await settle(page);
  await hold(page, 3500);
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
try {
  for (let i = 0; ; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) break;
    if (i > 60) throw new Error('dev server did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  const browser = await chromium.launch({
    args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: 'light' });
  await page.addInitScript(CURSOR);

  // Chrome sends a frame whenever the page repaints, with its time; each is held until the next.
  const cdp = await page.context().newCDPSession(page);
  const frames: { file: string; at: number }[] = [];
  const writes: Promise<void>[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ file, at: metadata.timestamp! });
    writes.push(writeFile(join(FRAMES, file), Buffer.from(data, 'base64')));
    void cdp.send('Page.screencastFrameAck', { sessionId });
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEWPORT.width * SCALE,
    maxHeight: VIEWPORT.height * SCALE,
  });
  // Beats are timed on the same clock as the frames, from the first one.
  const clock = () => Date.now() / 1000;
  const start = clock();
  const beats: Beats = { viewport: VIEWPORT, duration: 0, scenes: [], zooms: [] };
  await tour(page, () => clock() - start, beats);
  const end = clock();
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  await browser.close();

  // ffmpeg's concat list: each frame with how long it showed, from `start`.
  const shown = frames.filter((f, i) => (frames[i + 1]?.at ?? end) > start);
  const list = shown
    .map((f, i) => `file '${f.file}'\nduration ${((shown[i + 1]?.at ?? end) - Math.max(f.at, start)).toFixed(4)}`)
    .concat(`file '${shown.at(-1)!.file}'`)
    .join('\n');
  await writeFile(join(FRAMES, 'list.txt'), list);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(FRAMES, 'list.txt'),
    '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
    // A keyframe every second, so the editor can seek anywhere quickly.
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-g', String(FPS), '-movflags', '+faststart', join(DIR, 'footage.mp4'),
  ]);
  beats.duration = end - start;
  await writeFile(join(DIR, 'beats.json'), JSON.stringify(beats, null, 2) + '\n');
  console.log(`footage: ${shown.length} frames, ${beats.duration.toFixed(1)} s, ${beats.scenes.length} scenes -> ${DIR}/footage.mp4, ${DIR}/beats.json`);
} finally {
  process.kill(-server.pid!);
}

import { describe, expect, it } from 'vitest';
import { OIL_SLOSH } from '../src/lib/config';
import { createSurface, lurch, resizeSurface, stepSurface, stir, rockAt, type SloshParams } from '../src/lib/slosh';

const still: SloshParams = { ...OIL_SLOSH, rock: { ...OIL_SLOSH.rock, accel: 0 } };
const run = (s: ReturnType<typeof createSurface>, seconds: number, params: SloshParams = OIL_SLOSH, from = 0) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepSurface(s, from + t, 1 / 60, params);
};
const mean = (a: Float64Array) => a.reduce((x, y) => x + y, 0) / a.length;

describe('oil slosh', () => {
  it('lays columns across the width at the resting depth', () => {
    const s = createSurface(400);
    expect(s.h.length).toBe(51);
    expect([...s.h].every((h) => h === OIL_SLOSH.depthPx)).toBe(true);
  });

  it('stays level without a tilt or a push', () => {
    const s = createSurface(400, still);
    run(s, 5, still);
    expect(Math.max(...s.h) - Math.min(...s.h)).toBeLessThan(1e-9);
  });

  it('rocks from the walls: one end heaps up as the other falls, keeping its volume', () => {
    const s = createSurface(800);
    // A quarter of the swing in, the push is near its peak, upward at the right wall.
    run(s, OIL_SLOSH.rock.periodS / 4);
    expect(rockAt(OIL_SLOSH.rock.periodS / 4)).toBeGreaterThan(0);
    expect(s.h[s.h.length - 1]!).toBeGreaterThan(OIL_SLOSH.depthPx);
    expect(s.h[0]!).toBeLessThan(OIL_SLOSH.depthPx);
    expect(mean(s.h)).toBeCloseTo(OIL_SLOSH.depthPx, 0);
  });

  it('keeps the waves well inside the band as it rocks on', () => {
    const s = createSurface(1280);
    run(s, 40);
    expect(Math.min(...s.h)).toBeGreaterThan(OIL_SLOSH.minPx);
    expect(Math.max(...s.h)).toBeLessThan(OIL_SLOSH.maxPx);
  });

  it('pushes up ahead of a pointer and down behind it, only nearby, then settles', () => {
    const s = createSurface(800, still);
    stir(s, 400, 1000, still);
    const at = (x: number) => s.v[Math.round(x / still.columnPx)]!;
    expect(at(430)).toBeGreaterThan(0);
    expect(at(370)).toBeLessThan(0);
    expect(at(100)).toBe(0);
    run(s, 12, still);
    expect(Math.max(...s.h.map((h) => Math.abs(h - still.depthPx)))).toBeLessThan(0.5);
  });

  it('stays within its bounds under hard stirring and a long frame', () => {
    const s = createSurface(600);
    for (let i = 0; i < 50; i++) stir(s, (i * 37) % 600, i % 2 ? 5000 : -5000);
    stepSurface(s, 0, 0.5);
    run(s, 2);
    expect([...s.h].every((h) => Number.isFinite(h) && h >= OIL_SLOSH.minPx && h <= OIL_SLOSH.maxPx)).toBe(true);
  });

  it('keeps its shape when the width changes', () => {
    const s = createSurface(400, still);
    s.h[0] = 60;
    const wider = resizeSurface(s, 800, still);
    expect(wider.h.length).toBe(101);
    expect(wider.h[0]).toBe(60);
    expect(wider.h[wider.h.length - 1]).toBe(still.depthPx);
  });

  it('heaps to one side on a lurch, without adding oil', () => {
    const s = createSurface(400, still);
    lurch(s, 40);
    run(s, 0.3, still);
    expect(s.h[s.h.length - 1]!).toBeGreaterThan(still.depthPx);
    expect(s.h[0]!).toBeLessThan(still.depthPx);
    expect(mean(s.h)).toBeCloseTo(still.depthPx, 1);
  });
});

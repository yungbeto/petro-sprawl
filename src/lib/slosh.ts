// The menu footer's easter egg: a puddle of crude at the bottom of the page, sloshing as if the footer
// were a tank being rocked. The surface is a row of columns, each a damped spring pulled toward a level
// that tilts slowly back and forth, and joined to its neighbours so a push spreads as a wave. Viscous
// means heavy damping and slow spread: it rolls, it doesn't splash.

import { OIL_SLOSH } from './config';

export interface Surface {
  /** Height of each column above the floor, in px. */
  h: Float64Array;
  /** Vertical speed of each column, px per second. */
  v: Float64Array;
}

export interface SloshParams {
  depthPx: number;
  minPx: number;
  maxPx: number;
  columnPx: number;
  stiffness: number;
  spread: number;
  damping: number;
  maxStepS: number;
  rock: { accel: number; periodS: number; wallPx: number };
  stir: { radiusPx: number; gain: number; maxImpulse: number };
}

/** Columns spaced `columnPx` apart across `width`, all at rest. */
export function createSurface(width: number, params: SloshParams = OIL_SLOSH): Surface {
  const n = Math.max(2, Math.ceil(width / params.columnPx) + 1);
  return { h: new Float64Array(n).fill(params.depthPx), v: new Float64Array(n) };
}

/**
 * How hard the tank is being rocked at time `t` (s), px/s² at the walls: a slow swing, with a second, slower
 * swell so it never quite repeats.
 */
export function rockAt(t: number, params: SloshParams = OIL_SLOSH): number {
  const { rock } = params;
  return rock.accel * (Math.sin((2 * Math.PI * t) / rock.periodS) + 0.4 * Math.sin((2 * Math.PI * t) / (rock.periodS * 2.7) + 1.3));
}

/**
 * Advances the surface by `dt` seconds at time `t`, in fixed substeps so a slow frame can't blow it up.
 * Rocking a tank moves the oil only where it meets the walls: there it heaps up on one side and drops on
 * the other, and the waves roll in from the ends. A weak pull back to the resting depth keeps the volume.
 */
export function stepSurface(s: Surface, t: number, dt: number, params: SloshParams = OIL_SLOSH): void {
  const { h, v } = s;
  const n = h.length;
  const steps = Math.max(1, Math.ceil(dt / params.maxStepS));
  const step = Math.min(dt, params.maxStepS * steps) / steps;
  const wall = Math.max(1, params.rock.wallPx / params.columnPx);
  for (let k = 0; k < steps; k++) {
    const rock = rockAt(t + k * step, params);
    for (let i = 0; i < n; i++) {
      const left = h[i - 1] ?? h[i]!;
      const right = h[i + 1] ?? h[i]!;
      // Up at the right wall and down at the left as the tank swings one way, fading inward.
      const fromRight = n - 1 - i;
      const drive = rock * (Math.max(0, 1 - fromRight / wall) - Math.max(0, 1 - i / wall));
      const pull =
        params.stiffness * (params.depthPx - h[i]!) + params.spread * (left + right - 2 * h[i]!) - params.damping * v[i]! + drive;
      v[i] = v[i]! + pull * step;
    }
    for (let i = 0; i < n; i++) h[i] = Math.min(params.maxPx, Math.max(params.minPx, h[i]! + v[i]! * step));
  }
}

/**
 * A pointer moving across at `x` (px) with horizontal speed `speed` (px/s): it pushes the oil ahead of it
 * up and drags a trough behind, fading over `params.stir.radiusPx`.
 */
export function stir(s: Surface, x: number, speed: number, params: SloshParams = OIL_SLOSH): void {
  const { radiusPx, gain, maxImpulse } = params.stir;
  const impulse = Math.max(-maxImpulse, Math.min(maxImpulse, speed * gain));
  const centre = x / params.columnPx;
  const reach = radiusPx / params.columnPx;
  for (let i = Math.max(0, Math.floor(centre - reach)); i <= Math.min(s.v.length - 1, Math.ceil(centre + reach)); i++) {
    const d = (i - centre) / reach;
    if (Math.abs(d) >= 1) continue;
    // Odd in d: up ahead of the pointer, down behind it.
    s.v[i] = s.v[i]! + impulse * Math.sin(d * Math.PI) * (1 - Math.abs(d));
  }
}

/** Re-samples the surface to `width`, keeping its shape, after the footer resizes. */
export function resizeSurface(s: Surface, width: number, params: SloshParams = OIL_SLOSH): Surface {
  const next = createSurface(width, params);
  const m = next.h.length;
  for (let i = 0; i < m; i++) {
    const at = (i / Math.max(1, m - 1)) * (s.h.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(s.h.length - 1, lo + 1);
    const f = at - lo;
    next.h[i] = s.h[lo]! * (1 - f) + s.h[hi]! * f;
    next.v[i] = s.v[lo]! * (1 - f) + s.v[hi]! * f;
  }
  return next;
}

/**
 * The whole tank jolted sideways (a scroll arriving at the footer): the oil heaps toward one side, by
 * `impulse` px/s at the ends and nothing in the middle, so its volume holds.
 */
export function lurch(s: Surface, impulse: number): void {
  const mid = (s.v.length - 1) / 2;
  for (let i = 0; i < s.v.length; i++) s.v[i] = s.v[i]! + (impulse * (i - mid)) / Math.max(1, mid);
}

export type Rgba = [number, number, number, number];

/** Parses #rgb, #rrggbb or #rrggbbaa. Returns null for anything else. */
export function parseHexColor(value: string): Rgba | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 255];
}

export function withAlpha([r, g, b, a]: Rgba, factor: number): Rgba {
  return [r, g, b, Math.round(a * factor)];
}

/** Linear mix from a (t = 0) to b (t = 1), clamped. For sequential scales. */
export function mixColors(a: Rgba, b: Rgba, t: number): Rgba {
  const k = Math.min(1, Math.max(0, t));
  return a.map((v, i) => Math.round(v + (b[i]! - v) * k)) as unknown as Rgba;
}

import { parseHexColor, type Rgba } from '../lib/color';

const TOKENS = {
  basinLine: '--map-basin-line',
  basinFillHover: '--map-basin-fill-hover',
  basinLabel: '--map-basin-label',
  ink: '--map-ink',
  halo: '--map-halo',
  selection: '--map-selection',
  operating: '--status-operating',
  reduced: '--status-reduced',
  offline: '--status-offline',
  unknown: '--status-unknown',
} as const;

export type MapColors = Record<keyof typeof TOKENS, Rgba>;

/** Reads the map's colors from the current theme's CSS tokens. */
export function readMapColors(): MapColors {
  const style = getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([key, token]) => [
    key,
    parseHexColor(style.getPropertyValue(token)) ?? [128, 128, 128, 255],
  ]);
  return Object.fromEntries(entries) as MapColors;
}

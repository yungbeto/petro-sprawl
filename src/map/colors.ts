import { parseHexColor, type Rgba } from '../lib/color';

const TOKENS = {
  basinLine: '--map-basin-line',
  basinFillHover: '--map-basin-fill-hover',
  basinLineFocus: '--map-basin-line-focus',
  basinFillFocus: '--map-basin-fill-focus',
  basinLabel: '--map-basin-label',
  ink: '--map-ink',
  halo: '--map-halo',
  selection: '--map-selection',
  operating: '--map-pipeline-operating',
  measuredFlow: '--status-operating',
  reduced: '--status-reduced',
  offline: '--status-offline',
  unknown: '--status-unknown',
  flowBelow: '--flow-below',
  flowNear: '--flow-near',
  flowAbove: '--flow-above',
  storageLess: '--map-storage-less',
  storageEven: '--map-storage-even',
  storageMore: '--map-storage-more',
  storageNone: '--map-storage-none',
  storageLine: '--map-storage-line',
  /** Origin arcs: foreign in ink, other US regions in a muted tone. Not status colors. */
  arcForeign: '--map-selection',
  arcDomestic: '--text-muted',
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

// Thresholds and constants shared by the app and the data jobs.

/** Initial camera: the Europe, Russia, Caspian, North Africa and Middle East corridor. [[west, south], [east, north]] */
export const THEATER_BOUNDS: [[number, number], [number, number]] = [
  [-15, 10],
  [65, 72],
];

/** Claims older than this show an "unverified since" marker, whatever their status. */
export const STALE_AFTER_DAYS = 30;

/** Flow index bands: below < BELOW, near BELOW..ABOVE, above > ABOVE. */
export const FLOW_INDEX_BANDS = { below: 0.85, above: 1.15 } as const;

/** Basemap vector styles, one per theme. OpenFreeMap, no key needed. */
export const BASEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Decimal places kept when writing the camera to the URL. */
export const CAMERA_PRECISION = { lonLat: 4, zoom: 2 } as const;

export const STORAGE_KEYS = {
  theme: 'et.theme',
  panelCollapsed: 'et.panelCollapsed',
} as const;

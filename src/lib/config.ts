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

/**
 * Chokepoint flow windows, in days. The index compares the recent average with two baselines:
 * the trailing year (SPEC) and the five years before that, which a long disruption can't absorb
 * within a year. The map colors by the five-year index. Each window needs a minimum of points.
 */
export const FLOW_WINDOWS = {
  recentDays: 7,
  minRecentPoints: 5,
  trailingDays: 365,
  minTrailingPoints: 300,
  fiveYearDays: 5 * 365,
  minFiveYearPoints: 1500,
  sparklineDays: 90,
} as const;

/** Basemap vector styles, one per theme. OpenFreeMap, no key needed. */
export const BASEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Decimal places kept when writing the camera to the URL. */
export const CAMERA_PRECISION = { lonLat: 4, zoom: 2 } as const;

/**
 * EIA World Oil Transit Chokepoints, Table 1, 2024 column (crude oil and petroleum liquids, mb/d).
 * Read from the page on 2026-10-28; 2024 is the latest full year in the table. Panama is EIA
 * fiscal year 2024 (Oct 2023 to Sep 2024). Suez and Bab el-Mandeb are low in 2024 because
 * tankers rerouted around the Cape of Good Hope.
 * PortWatch ids map each chokepoint to its IMF PortWatch transit series.
 */
export const EIA_CHOKEPOINTS_SOURCE =
  'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints';
export const EIA_REFERENCE_YEAR = 2024;

export const CHOKEPOINTS = [
  { id: 'hormuz', name: 'Strait of Hormuz', portwatchId: 'chokepoint6', eiaReferenceMbd: 20.7 },
  { id: 'malacca', name: 'Strait of Malacca', portwatchId: 'chokepoint5', eiaReferenceMbd: 22.5 },
  { id: 'suez', name: 'Suez Canal and SUMED', portwatchId: 'chokepoint1', eiaReferenceMbd: 4.8 },
  { id: 'babelm', name: 'Bab el-Mandeb', portwatchId: 'chokepoint4', eiaReferenceMbd: 4.1 },
  // PortWatch tracks the Oresund only; EIA's Danish Straits also cover the Great Belt. See TODO-research.md.
  { id: 'danish', name: 'Danish Straits', portwatchId: 'chokepoint10', eiaReferenceMbd: 4.9 },
  // PortWatch tracks the Bosporus; EIA reports the Turkish Straits at the Dardanelles.
  { id: 'turkish', name: 'Turkish Straits', portwatchId: 'chokepoint3', eiaReferenceMbd: 3.6 },
  { id: 'panama', name: 'Panama Canal', portwatchId: 'chokepoint2', eiaReferenceMbd: 2.0 },
] as const;

/** Shown in the chokepoint detail where the PortWatch series and the EIA figure measure different places. */
export const CHOKEPOINT_NOTES: Partial<Record<string, string>> = {
  danish: 'PortWatch counts transits through the Oresund only. EIA figures cover all Danish Straits, including the Great Belt.',
  turkish: 'PortWatch counts transits through the Bosporus. EIA reports the Turkish Straits at the Dardanelles.',
};

/**
 * Pipeline line width. Oil capacity is converted to a gas equivalent for sizing only:
 * 1 mb/d of oil carries roughly the energy of 60 bcm/yr of gas. Never shown as a figure.
 */
export const PIPELINE_WIDTH = {
  minPx: 1,
  maxPx: 7,
  /** px per sqrt(bcm/yr) */
  scale: 0.8,
  oilMbdToGasBcm: 60,
  approxFactor: 0.6,
  approxAlpha: 0.5,
} as const;

/** Chokepoint ring radius: area proportional to EIA volume. px per sqrt(mb/d). */
export const CHOKEPOINT_RADIUS = { scale: 4, minPx: 5 } as const;

export const MAP_ATTRIBUTION = [
  'Pipelines: <a href="https://globalenergymonitor.org/">Global Energy Monitor</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)',
  'Basins: <a href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">USGS</a>',
  'Chokepoints: <a href="https://portwatch.imf.org/">IMF PortWatch</a>, <a href="https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints">EIA</a>',
];

/** IMF PortWatch daily transits. The job keeps ~400 days: 365 for the baseline plus slack. */
export const PORTWATCH = {
  dailyUrl:
    'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
  keepDays: 400,
  /** A series with fewer points is treated as a broken fetch, not published. */
  minPoints: 300,
  /** Latest point older than this means the upstream feed stalled; the run fails and the old file stays. */
  maxLagDays: 21,
} as const;

/**
 * How often each dataset is expected to refresh. Scheduled datasets past `staleAfterHours`
 * are marked stale in the panel. Manual imports are never marked stale by age.
 */
export const DATASET_FRESHNESS: Record<string, { label: string; scheduled: boolean; staleAfterHours?: number }> = {
  'chokepoint-transits': { label: 'Chokepoint transits', scheduled: true, staleAfterHours: 18 },
  pipelines: { label: 'Pipelines', scheduled: false },
  chokepoints: { label: 'Chokepoints', scheduled: false },
  basins: { label: 'Basins', scheduled: false },
  disruptions: { label: 'Disruptions', scheduled: false },
};

/** Basemap zoom at which basin labels appear. */
export const BASIN_LABEL_MIN_ZOOM = 4.5;

/** Padding (px) when the camera fits a selected feature. */
export const FIT_PADDING = 80;

/** Zoom used when flying to a point feature. */
export const POINT_FOCUS_ZOOM = 6;

export const STORAGE_KEYS = {
  theme: 'et.theme',
  panelCollapsed: 'et.panelCollapsed',
} as const;

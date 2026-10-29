// Thresholds and constants shared by the app and the data jobs.

/** Initial camera: the Europe, Russia, Caspian, North Africa and Middle East corridor. [[west, south], [east, north]] */
export const THEATER_BOUNDS: [[number, number], [number, number]] = [
  [-15, 10],
  [65, 72],
];

/** What the basin and pipeline imports keep: the whole world. The theater above is only where the camera opens. */
export const IMPORT_BOUNDS: [[number, number], [number, number]] = [
  [-180, -90],
  [180, 90],
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
  /** Operating lines recede so chokepoints and status problems stand out. */
  operatingAlpha: 0.55,
} as const;

/** Chokepoint ring radius: area proportional to EIA volume. px per sqrt(mb/d). */
export const CHOKEPOINT_RADIUS = { scale: 4, minPx: 5, haloPx: 6 } as const;

/**
 * LNG terminal dot radius: area proportional to capacity in operation, or planned capacity when
 * nothing operates yet. px per sqrt(mtpa). Import terminals get a hollow centre of centreShare.
 */
export const LNG_RADIUS = { scale: 1.4, minPx: 4, maxPx: 10, centreShare: 0.45, selectionGapPx: 4 } as const;

/** Oil terminals are diamonds of one size: no comparable capacity figures to scale them by. */
export const TERMINAL_MARKER = { sizePx: 15, haloPx: 19, selectionRadiusPx: 13 } as const;

export const MAP_ATTRIBUTION = [
  'Pipelines and LNG terminals: <a href="https://globalenergymonitor.org/">Global Energy Monitor</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)',
  'Basins: <a href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">USGS</a>',
  'Chokepoints: <a href="https://portwatch.imf.org/">IMF PortWatch</a>, <a href="https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints">EIA</a>',
  'Oil terminals: curated; locations from <a href="https://portwatch.imf.org/">IMF PortWatch</a> and Global Energy Monitor',
  'Port calls: <a href="https://portwatch.imf.org/">IMF PortWatch</a>',
  'Gas flows: <a href="https://transparency.entsog.eu/">ENTSOG</a>',
  'Gas storage: <a href="https://agsi.gie.eu/">GIE AGSI+</a>',
  'LNG send-out: <a href="https://alsi.gie.eu/">GIE ALSI</a>',
  'Countries: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
];

/** The basemap's own credits, repeated in the panel's source list. MapLibre shows them from the style. */
export const BASEMAP_CREDITS = [
  { label: 'OpenFreeMap', url: 'https://openfreemap.org/' },
  { label: 'OpenMapTiles', url: 'https://www.openmaptiles.org/' },
  { label: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
] as const;

/** IMF PortWatch daily transits. The job keeps ~400 days: 365 for the baseline plus slack. */
export const PORTWATCH = {
  dailyUrl:
    'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
  keepDays: 400,
  /** A series with fewer points is treated as a broken fetch, not published. */
  minPoints: 300,
  /** Latest point older than this means the upstream feed stalled; the run fails and the old file stays. */
  maxLagDays: 21,
  /** Attempts per request. The service fails queries at random; see jobs/fetch-portwatch.ts. */
  attempts: 6,
} as const;

/**
 * Ports at the end of a mapped pipeline, with IMF PortWatch daily tanker port calls. Only ports the
 * Daily_Ports_Data layer actually reports: on 2026-10-29 it had no rows for Yanbu, Sidi Kerir,
 * Novorossiysk, Primorsk, Ras Laffan, Ras Tanura, Juaymah, Das Island or El Sokhna, and Ust-Luga
 * stopped on 2026-07-26 (TODO-research.md). Calls are context, not evidence: a tanker at the
 * port may be loading oil from another source, and two pipelines end at Ceyhan.
 */
export const PORT_CALLS = {
  dailyUrl: 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query',
  ports: [
    { portwatchId: 'port362', name: 'Fujairah', pipelineIds: ['habshan-fujairah'] },
    // PortWatch names it "Botas": the BOTAŞ marine terminal at Ceyhan, 36.88° N 35.92° E.
    { portwatchId: 'port162', name: 'Ceyhan', pipelineIds: ['kirkuk-ceyhan', 'btc'] },
  ],
} as const;

export const portCallsSeriesId = (portwatchId: string) => `portwatch-${portwatchId}`;

/** Curated-to-GEM dedup: smallest name similarity (Dice on name words) that counts as a match. */
export const DEDUP = { minNameSimilarity: 0.6 } as const;

/**
 * ENTSOG physical flows, one series per operator, point and direction, linked to a pipeline.
 * Point keys checked against the platform's operatorpointdirections on 2026-10-28.
 */
export const ENTSOG = {
  apiUrl: 'https://transparency.entsog.eu/api/v1/operationaldatas',
  keepDays: 400,
  /** A run fails, keeping the last good file, if a series' latest day is older than this. */
  maxLagDays: 7,
  points: [
    { pipelineId: 'turkstream', operatorKey: 'BG-TSO-0001', pointKey: 'ITP-00549', direction: 'entry', label: 'Strandzha 2, entry into Bulgaria (European line only)' },
    { pipelineId: 'trans-adriatic', operatorKey: 'IT-TSO-0001', pointKey: 'ITP-00008', direction: 'entry', label: 'Melendugno, entry into Italy' },
    { pipelineId: 'transmed', operatorKey: 'IT-TSO-0001', pointKey: 'ITP-00093', direction: 'entry', label: 'Mazara del Vallo, entry into Italy' },
    { pipelineId: 'greenstream', operatorKey: 'IT-TSO-0001', pointKey: 'ITP-00074', direction: 'entry', label: 'Gela, entry into Italy' },
    { pipelineId: 'medgaz', operatorKey: 'ES-TSO-0006', pointKey: 'ITP-00048', direction: 'entry', label: 'Almería, entry into Spain' },
    { pipelineId: 'yamal-europe', operatorKey: 'DE-TSO-0001', pointKey: 'ITP-00096', direction: 'entry', label: 'Mallnow, entry into Germany' },
    { pipelineId: 'urengoy-pomary-uzhhorod', operatorKey: 'SK-TSO-0001', pointKey: 'ITP-00117', direction: 'entry', label: 'Velké Kapušany, entry into Slovakia' },
    { pipelineId: 'langeled', operatorKey: 'UK-TSO-0001', pointKey: 'ITP-00091', direction: 'entry', label: 'Easington, entry into Great Britain' },
    { pipelineId: 'franpipe', operatorKey: 'FR-TSO-0003', pointKey: 'ITP-00045', direction: 'entry', label: 'Dunkerque, entry into France' },
    { pipelineId: 'zeepipe', operatorKey: 'BE-TSO-0001', pointKey: 'ITP-00106', direction: 'entry', label: 'Zeebrugge ZPT, entry into Belgium' },
    { pipelineId: 'baltic-pipe', operatorKey: 'PL-TSO-0002', pointKey: 'ITP-10009', direction: 'entry', label: 'Faxe, entry into Poland' },
  ],
} as const;

export const entsogSeriesId = (p: { operatorKey: string; pointKey: string; direction: string }) =>
  `entsog-${p.pointKey}-${p.operatorKey}-${p.direction}`.toLowerCase();

/**
 * GIE AGSI+ gas storage by country. Needs a free API key (AGSI_API_KEY), sent as the x-key header.
 * Countries are those in AGSI+'s provider listing (checked 2026-10-28) with live storage. Ireland's only
 * site is decommissioned. AGSI+ uses its own country slug where it differs from the ISO code.
 */
export const AGSI = {
  apiUrl: 'https://agsi.gie.eu/api',
  keepDays: 400,
  pageSize: 300,
  maxLagDays: 7,
  countries: ['AT', 'BE', 'BG', 'CZ', 'DE', 'DK', 'ES', 'FR', 'GB', 'HR', 'HU', 'IT', 'LV', 'NL', 'PL', 'PT', 'RO', 'SE', 'SK', 'UA'],
  /** "GB" is the pre-Brexit series, empty since; current UK data is under "GB*". */
  slugs: { GB: 'GB*' } as Record<string, string>,
} as const;

export const agsiSeriesId = (country: string) => `agsi-${country.toLowerCase()}`;

/**
 * GIE ALSI daily send-out by LNG import terminal, with the AGSI key. Each GEM terminal lists the ALSI
 * facilities that make it up (company and facility EIC codes from ALSI's listing, checked 2026-10-29,
 * matched by coordinates and GEM's aliases). Left out: facilities ALSI has closed (Lubmin, Le Havre,
 * the UK's, El Musel before 2023, Panigaglia before March 2025) and Spain's virtual tank (TVB).
 */
export const ALSI = {
  apiUrl: 'https://alsi.gie.eu/api',
  keepDays: 120,
  pageSize: 300,
  maxLagDays: 7,
  terminals: [
    { terminalId: 'gem-t100000130426-import', facilities: [{ country: 'BE', company: '21X000000001006T', eic: '21W0000000001245' }] },
    { terminalId: 'gem-t100000130430-import', facilities: [{ country: 'HR', company: '31X-LNG-HR-----7', eic: '31W-0000-G-000-Z' }] },
    { terminalId: 'gem-t100000131064-import', facilities: [{ country: 'FI', company: '66X000000000027Z', eic: '21W000000000130A' }] },
    { terminalId: 'gem-t100000130438-import', facilities: [{ country: 'FI', company: '66X-00000000024H', eic: '66W000000000001U' }] },
    { terminalId: 'gem-t100000130452-import', facilities: [{ country: 'FR', company: '21X0000000010679', eic: '63W179356656691A' }] },
    { terminalId: 'gem-t100000130456-import', facilities: [{ country: 'FR', company: '21X0000000010679', eic: '63W631527814486R' }] },
    { terminalId: 'gem-t100000130446-import', facilities: [{ country: 'FR', company: '21X000000001331I', eic: '21W0000000000451' }] },
    { terminalId: 'gem-t100000130448-import', facilities: [{ country: 'FR', company: '21X000000001070K', eic: '63W943693783886F' }] },
    { terminalId: 'gem-t100000130458-import', facilities: [{ country: 'DE', company: '21X000000001403J', eic: '21W000000000129W' }] },
    { terminalId: 'gem-t100000130460-import', facilities: [{ country: 'DE', company: '21X000000001403J', eic: '37W000000000107A' }] },
    { terminalId: 'gem-t100000131086-import', facilities: [{ country: 'DE', company: '21X000000001403J', eic: '37W000000000110L' }] },
    { terminalId: 'gem-t100000131097-import', facilities: [{ country: 'DE', company: '21X000000001403J', eic: '37W000000000111J' }] },
    { terminalId: 'gem-t100000131141-import', facilities: [{ country: 'DE', company: '37X000000000265F', eic: '37W000000000114D' }] },
    { terminalId: 'gem-t100000130681-import', facilities: [{ country: 'GR', company: '21X738265265081N', eic: '21W0000000001318' }] },
    { terminalId: 'gem-t100000130462-import', facilities: [{ country: 'GR', company: '21X-GR-A-A0A0A-G', eic: '21W000000000040B' }] },
    { terminalId: 'gem-t100000130474-import', facilities: [{ country: 'IT', company: '21X000000001109G', eic: '21W0000000000443' }] },
    { terminalId: 'gem-t100000131096-import', facilities: [{ country: 'IT', company: '59XFSRUITALIASTY', eic: '59WFSRUGOLARTUNH' }] },
    { terminalId: 'gem-t100000131095-import', facilities: [{ country: 'IT', company: '59XFSRUITALIASTY', eic: '59WBWSINGAPORERX' }] },
    { terminalId: 'gem-t100000130476-import', facilities: [{ country: 'IT', company: '59XFSRUITALIASTY', eic: '59W0000000000011' }] },
    { terminalId: 'gem-t100000130466-import', facilities: [{ country: 'IT', company: '21X000000001360B', eic: '21W000000000082W' }] },
    { terminalId: 'gem-t100000130488-import', facilities: [{ country: 'LT', company: '21X0000000013740', eic: '21W0000000001253' }] },
    { terminalId: 'gem-t100000130997-import', facilities: [{ country: 'NL', company: '52X000000000088H', eic: '52W000000000001W' }] },
    { terminalId: 'gem-t100000130492-import', facilities: [{ country: 'NL', company: '21X000000001063H', eic: '21W0000000000079' }] },
    { terminalId: 'gem-t100000130498-import', facilities: [{ country: 'PL', company: '21X-PL-A-A0A0A-B', eic: '21W000000000096L' }] },
    { terminalId: 'gem-t100000130500-import', facilities: [{ country: 'PT', company: '21X0000000013619', eic: '16WTGNL01------O' }] },
    { terminalId: 'gem-t100000130524-import', facilities: [{ country: 'ES', company: '21X000000001352A', eic: '21W0000000000362' }] },
    { terminalId: 'gem-t100000130522-import', facilities: [{ country: 'ES', company: '21X000000001254A', eic: '21W000000000039X' }] },
    { terminalId: 'gem-t100000130532-import', facilities: [{ country: 'ES', company: '21X000000001254A', eic: '21W0000000000370' }] },
    { terminalId: 'gem-t100000130526-import', facilities: [{ country: 'ES', company: '21X000000001254A', eic: '21W000000000038Z' }] },
    { terminalId: 'gem-t100000130528-import', facilities: [{ country: 'ES', company: '21X000000000134P', eic: '21W0000000000346' }] },
    { terminalId: 'gem-t100000130536-import', facilities: [{ country: 'ES', company: '18XTGPRS-12345-G', eic: '21W0000000000354' }] },
    { terminalId: 'gem-t100000130534-import', facilities: [{ country: 'ES', company: '18XRGNSA-12345-V', eic: '21W0000000000338' }] },
  ],
} as const;

export const alsiSeriesId = (terminalId: string) => `alsi-${terminalId}`;

/** Measured flow: a 7-day mean at or below this share of technical capacity counts as no flow. */
export const MEASURED_FLOW = { windowDays: 7, idleShare: 0.005 } as const;

/**
 * How often each dataset is expected to refresh. Scheduled datasets past `staleAfterHours`
 * are marked stale in the panel. Manual imports are never marked stale by age. `publisher` names
 * the source in the panel's source list.
 */
export const DATASET_FRESHNESS: Record<
  string,
  { label: string; scheduled: boolean; staleAfterHours?: number; publisher?: string }
> = {
  'chokepoint-transits': { label: 'Chokepoint transits', scheduled: true, staleAfterHours: 18, publisher: 'IMF PortWatch' },
  'port-calls': { label: 'Port calls', scheduled: true, staleAfterHours: 18, publisher: 'IMF PortWatch' },
  'gas-flows': { label: 'Gas flows', scheduled: true, staleAfterHours: 36, publisher: 'ENTSOG Transparency Platform' },
  'gas-storage': { label: 'Gas storage', scheduled: true, staleAfterHours: 36, publisher: 'GIE AGSI+' },
  'lng-sendout': { label: 'LNG send-out', scheduled: true, staleAfterHours: 36, publisher: 'GIE ALSI' },
  countries: { label: 'Countries', scheduled: false, publisher: 'Natural Earth' },
  pipelines: { label: 'Pipelines', scheduled: false, publisher: 'Global Energy Monitor' },
  'lng-terminals': { label: 'LNG terminals', scheduled: false, publisher: 'Global Energy Monitor' },
  'oil-terminals': { label: 'Oil terminals', scheduled: false, publisher: 'Curated; locations from IMF PortWatch and Global Energy Monitor' },
  chokepoints: { label: 'Chokepoints', scheduled: false, publisher: 'IMF PortWatch and EIA' },
  basins: { label: 'Basins', scheduled: false, publisher: 'USGS' },
  disruptions: { label: 'Disruptions', scheduled: false },
};

/**
 * A country spans a basin when their land overlap is at least minAreaM2, or covers at least
 * minCountryShare of the country (so small states like Bahrain count). Natural Earth 1:50m land.
 */
export const BASIN_COUNTRY_OVERLAP = { minAreaM2: 1e9, minCountryShare: 0.2 } as const;

/** Basemap zoom at which basin labels appear. */
export const BASIN_LABEL_MIN_ZOOM = 4.5;

/** Padding (px) when the camera fits a selected feature. */
export const FIT_PADDING = 80;

/** Zoom used when flying to a point feature. */
export const POINT_FOCUS_ZOOM = 6;

export const STORAGE_KEYS = {
  theme: 'et.theme',
  visits: 'et.visits',
} as const;

/**
 * "What changed since last visit". Loads closer together than sameVisitMinutes are one visit, so a
 * reload doesn't swallow the changes. Smaller moves than these are left out of the list.
 */
export const CHANGES = {
  sameVisitMinutes: 30,
  /** Storage fill, percentage points. */
  storageMovePts: 2,
  /** Measured pipeline flow as share of capacity, percentage points. */
  flowSharePts: 15,
} as const;

export const SEARCH = { limit: 8 } as const;

/** Quick filters: how faint non-matching assets get, and how many matches the panel lists. */
export const FILTERS = { fadeAlpha: 0.12, listLimit: 300 } as const;

/** Detail views: how many related assets show before "Show all". */
export const DETAIL = { relatedLimit: 6 } as const;

/**
 * Weekly claims refresh (jobs/refresh-claims.ts): Claude searches the web for a newer dated source for
 * each cited claim older than STALE_AFTER_DAYS, and code checks every draft against the page itself.
 * A draft that confirms the status we show, from a trusted domain, is committed; anything else opens a
 * pull request for review. Prices are per million tokens and per search, for the run's cost estimate.
 */
export const CLAIMS_REFRESH = {
  model: 'claude-haiku-5-5',
  maxSearches: 4,
  pageTimeoutMs: 30_000,
  /** Quotes outside this many words are too thin to check, or more than a short quotation. */
  quoteWords: { min: 6, max: 50 },
  /** A first claim for an asset with none must describe something this recent. */
  firstClaimDays: 90,
  /** Old claims about lasting stops; searching again won't find anything newer. */
  skip: ['pipeline/urengoy-pomary-uzhhorod', 'pipeline/progress', 'pipeline/soyuz'],
  /** Governments, operators, wires and outlets already cited reliably; subdomains count. */
  trustedDomains: [
    'reuters.com',
    'apnews.com',
    'bloomberg.com',
    'bairdmaritime.com',
    'interfax.com',
    'tass.com',
    'aljazeera.com',
    'thenationalnews.com',
    'enterpriseam.com',
    'energyandcleanair.org',
    'timesca.com',
    'qazinform.com',
    'petra.gov.jo',
    'cpc.ru',
    'molgroup.info',
    'sgc.az',
    'gov',
  ],
  price: { inputPerM: 0.1, outputPerM: 0.5, perSearch: 0.01 },
} as const;

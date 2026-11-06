// Thresholds and constants shared by the app and the data jobs.

/** Initial camera: the Europe, Russia, Caspian, North Africa and Middle East corridor. [[west, south], [east, north]] */
/** Inhabited latitudes, for a surface that spans the world. */
export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-160, -45],
  [160, 70],
];

export const THEATER_BOUNDS: [[number, number], [number, number]] = [
  [-15, 10],
  [65, 72],
];

/** What the basin and pipeline imports keep: the whole world. The theater above is only where the camera opens. */
/** Where the gas storage surface frames: every country with a storage series, Canada and Chile to Japan and New Zealand. */
export const STORAGE_BOUNDS: [[number, number], [number, number]] = [
  [-125, -48],
  [178, 66],
];

/** Where the fuel origins surface frames: the lower 48 states, where the five fuel regions are. */
export const US_BOUNDS: [[number, number], [number, number]] = [
  [-125, 24],
  [-66, 50],
];

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
  /** Width of the invisible band that picks a pipeline, however thin it's drawn. */
  hitPx: 12,
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

/** The basemap's own credits, repeated on the About page. MapLibre shows them on the map from the style. */
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
  /**
   * Minutes from the job's start after which no new PortWatch request starts, for transits and then port
   * calls. A series not fetched by then keeps its previous one, and is fetched first next run
   * (data/reports/portwatch-state.json). The workflow step's cap (portwatch.yml) is 20 minutes, and six
   * attempts can take about 4.5 minutes per request, so without these the step was killed (2026-11-03)
   * and nothing was published.
   */
  budgetMinutes: { transits: 11, portCalls: 16 },
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
/**
 * PortWatch's estimates of cargo in metric tons: each tanker's payload, judged from its draft, times
 * its deadweight tonnage. Modelled from AIS, not measured; "tanker" includes products and chemicals.
 */
export const tankerCargoSeriesId = (portwatchId: string) => `portwatch-${portwatchId}-cargo`;
export const portExportsSeriesId = (portwatchId: string) => `portwatch-${portwatchId}-exports`;

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
 * EIA's weekly natural gas storage report, by API v2 (the EIA key): working gas in the Lower 48 and its
 * five storage regions, in billion cubic feet, for weeks ending Friday, published the next Thursday.
 * Route and series checked 2026-11-01.
 */
export const EIA_STORAGE = {
  route: 'natural-gas/stor/wkly',
  /** Weeks kept: two years, so the latest week always has the same week last year. */
  keepDays: 800,
  maxLagDays: 21,
  total: { series: 'NW2_EPG0_SWO_R48_BCF', name: 'Lower 48 states' },
  regions: [
    { series: 'NW2_EPG0_SWO_R31_BCF', id: 'east', name: 'East' },
    { series: 'NW2_EPG0_SWO_R32_BCF', id: 'midwest', name: 'Midwest' },
    { series: 'NW2_EPG0_SWO_R33_BCF', id: 'south-central', name: 'South Central' },
    { series: 'NW2_EPG0_SWO_R34_BCF', id: 'mountain', name: 'Mountain' },
    { series: 'NW2_EPG0_SWO_R35_BCF', id: 'pacific', name: 'Pacific' },
  ],
} as const;

/**
 * Statistics Canada table 25-10-0086-01, natural gas supply and disposition, monthly: closing inventory
 * in storage for Canada and the provinces with storage, in thousands of cubic metres. It replaced
 * 25-10-0057-01 (inactive since 2025-12). Checked 2026-11-01. Coordinates are geography.item.unit.
 */
export const STATCAN_STORAGE = {
  apiUrl: 'https://www150.statcan.gc.ca/t1/wds/rest',
  productId: 25100086,
  table: '25-10-0086-01',
  tableName: 'Natural gas supply and disposition, monthly',
  tableUrl: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601',
  closingInventoryMember: 2,
  cubicMetresMember: 1,
  months: 26,
  maxLagDays: 150,
  total: { member: 1, name: 'Canada' },
  provinces: [
    { member: 6, id: 'qc', name: 'Quebec' },
    { member: 7, id: 'on', name: 'Ontario' },
    { member: 9, id: 'sk', name: 'Saskatchewan' },
    { member: 10, id: 'ab', name: 'Alberta' },
    { member: 11, id: 'bc', name: 'British Columbia' },
  ],
} as const;

/**
 * JODI-Gas world database, the free CSV (beta): closing stocks (CLOSTLV) in million cubic metres, monthly.
 * Only values JODI assesses as comparable (1) or to use with caution (2) are kept; "not assessed" (3)
 * values include figures far from known volumes (Russia's at 50 million m³). Countries whose stocks are
 * all zero hold none. File listing found 2026-11-01 behind the downloads page.
 */
export const JODI_GAS = {
  filesUrl: 'https://api.publisher.jodidata.org/web/files/gas',
  downloadUrl: 'https://www.jodidata.org/jodi-publisher/gas',
  pageUrl: 'https://www.jodidata.org/gas/database/data-downloads.aspx',
  file: 'GAS_world_NewFormat.zip',
  flow: 'CLOSTLV',
  unit: 'M3',
  assessments: ['1', '2'],
  months: 26,
  /** A country whose latest month is older than this is left out rather than shown stale. */
  maxLagDays: 200,
  citation:
    'International Energy Forum (IEF). Joint Organizations Data Initiative (JODI) Database. JODI Oil and Gas World Databases: www.jodidata.org',
} as const;

export const eiaStorageSeriesId = (region?: string) => (region ? `eia-storage-us-${region}` : 'eia-storage-us');
export const statcanStorageSeriesId = (province?: string) => (province ? `statcan-storage-ca-${province}` : 'statcan-storage-ca');
export const jodiStorageSeriesId = (country: string) => `jodi-storage-${country.toLowerCase()}`;

/**
 * "Where is a country's oil from?" (SPEC M10): crude imports by partner. Eurostat nrg_ti_oilm for the
 * countries it reports (monthly, thousand tonnes, CC BY 4.0), UN Comtrade HS 2709 for the other largest
 * importers (annual, kg or US$), and EIA for the United States (M6's data). Checked 2026-11-01.
 */
export const CRUDE_IMPORTS = {
  /** Shares are over a country's latest 12 months (Eurostat, EIA) or latest year (Comtrade). */
  windowMonths: 12,
  /** Partners under this share fold into "other countries". */
  minShare: 0.01,
  /** How many of the largest importers (by Comtrade value) the list covers at least. */
  largest: 30,
} as const;

export const EUROSTAT_OIL = {
  apiUrl: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ti_oilm',
  pageUrl: 'https://ec.europa.eu/eurostat/databrowser/view/nrg_ti_oilm/default/table',
  dataset: 'nrg_ti_oilm',
  siec: 'O4100_TOT',
  unit: 'THS_T',
  /** Months asked for: the window plus slack for countries that lag. */
  months: 16,
  /** Reporters and partners that are groups, not countries. */
  aggregates: ['EU27_2020', 'EU28', 'EA21', 'EA20', 'EA19', 'TOTAL'],
  /** Eurostat's codes where they differ from ISO 3166 alpha-2. */
  iso2: { EL: 'GR', UK: 'GB', CN_X_HK: 'CN', XK: 'XK' } as Record<string, string>,
} as const;

export const COMTRADE = {
  apiUrl: 'https://comtradeapi.un.org/data/v1/get/C/A/HS',
  /** Without a key, the public preview: the same data, at most 500 records a call, rate limited. */
  previewUrl: 'https://comtradeapi.un.org/public/v1/preview/C/A/HS',
  partnersUrl: 'https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json',
  reportersUrl: 'https://comtradeapi.un.org/files/v1/app/reference/Reporters.json',
  pageUrl: 'https://comtradeplus.un.org/',
  cmdCode: '2709',
  /** Annual data changes rarely; the job reuses the last fetch for this long. */
  refreshDays: 7,
  /** Between calls, to stay under the rate limit. */
  gapMs: 2_500,
  /** Shares go by net weight when partners with a weight hold at least this share of the value; by value otherwise. */
  minWeightCoverage: 0.95,
} as const;

/**
 * Where each country's storage figure comes from, in the order they're preferred: AGSI+ where it reports
 * a country (daily, and fill as a share of capacity), then EIA for the US and Statistics Canada for
 * Canada (national, with regions), then JODI.
 */
export const STORAGE_SOURCES = {
  agsi: { name: 'GIE AGSI+', url: 'https://agsi.gie.eu/', cadence: 'daily' },
  eia: { name: 'EIA weekly natural gas storage report', url: 'https://ir.eia.gov/ngs/ngs.html', cadence: 'weekly' },
  statcan: { name: 'Statistics Canada', url: STATCAN_STORAGE.tableUrl, cadence: 'monthly' },
  jodi: { name: 'JODI-Gas', url: JODI_GAS.pageUrl, cadence: 'monthly' },
} as const;
export type StorageSourceId = keyof typeof STORAGE_SOURCES;

/** The gas storage map shades each country by its change against last year, out to this many percent either way. */
export const STORAGE_MAP = { vsLastYearPctRange: 30 } as const;

/**
 * Countries with large storage and no regular public series, named on the gas storage surface rather
 * than left blank (TODO-research.md, M10). China's figure is the IGU's annual one.
 */
export const STORAGE_NOT_COVERED: { country: string; note: string }[] = [
  { country: 'CN', note: 'No regular series; the IGU\'s 2025 storage report put its working gas volume at 19.8 bcm' },
  { country: 'RU', note: 'No regular public series found; JODI\'s figure is not assessed' },
  { country: 'IR', note: 'No regular public series found' },
];

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
/**
 * EIA's Petroleum Administration for Defense Districts, the regions "Where is my oil from?" answers for
 * (SPEC M6). State lists as EIA's glossary gives them, read 2026-10-29; PADD 1's three subdistricts are
 * merged, since the crude series are reported for PADD 1 as a whole.
 */
export const PADD_SOURCE = 'https://www.eia.gov/tools/glossary/index.php?id=P';
export const PADDS = [
  {
    id: 'padd-1',
    eia: 'R10',
    name: 'East Coast',
    states: [
      'Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'Rhode Island', 'Vermont',
      'Delaware', 'District of Columbia', 'Maryland', 'New Jersey', 'New York', 'Pennsylvania',
      'Florida', 'Georgia', 'North Carolina', 'South Carolina', 'Virginia', 'West Virginia',
    ],
  },
  {
    id: 'padd-2',
    eia: 'R20',
    name: 'Midwest',
    states: [
      'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Michigan', 'Minnesota', 'Missouri',
      'Nebraska', 'North Dakota', 'Ohio', 'Oklahoma', 'South Dakota', 'Tennessee', 'Wisconsin',
    ],
  },
  { id: 'padd-3', eia: 'R30', name: 'Gulf Coast', states: ['Alabama', 'Arkansas', 'Louisiana', 'Mississippi', 'New Mexico', 'Texas'] },
  { id: 'padd-4', eia: 'R40', name: 'Rocky Mountain', states: ['Colorado', 'Idaho', 'Montana', 'Utah', 'Wyoming'] },
  { id: 'padd-5', eia: 'R50', name: 'West Coast', states: ['Alaska', 'Arizona', 'California', 'Hawaii', 'Nevada', 'Oregon', 'Washington'] },
] as const;
export type PaddId = (typeof PADDS)[number]['id'];

/** EIA API v2 (free key, EIA_API_KEY). All crude volumes are thousand barrels a month. */
export const EIA = {
  apiUrl: 'https://api.eia.gov/v2',
  /** Months fetched: the trailing 12 complete months plus slack for series that lag. */
  months: 18,
  /** Months the origin shares are taken over. */
  windowMonths: 12,
  pageSize: 5000,
  /** Federal offshore production areas, by the PADD EIA counts them in. */
  offshore: { R3FM: 'padd-3', R5F: 'padd-5' } as Record<string, PaddId>,
  /** Origins below this share of a region's crude fold into "other countries". */
  minShare: 0.01,
  /**
   * The partner code for imports EIA counts in a PADD's total but doesn't break out by country (seen
   * for Gulf Coast gasoline blending components, 2026-08). Always folds into "other countries".
   */
  unnamedPartner: 'unnamed',
} as const;

/**
 * Refined fuels for "Where is my fuel from?" (SPEC M7), by EIA product code. Most gasoline moves
 * between regions and is imported as blending components, finished at terminals, so gasoline counts
 * both; `supplied` is the product whose "product supplied" is the region's use.
 */
export const FUELS = [
  { id: 'gasoline', label: 'Gasoline', products: ['EPM0F', 'EPOBG'], supplied: 'EPM0F' },
  { id: 'diesel', label: 'Diesel and heating oil', products: ['EPD0'], supplied: 'EPD0' },
  { id: 'jet', label: 'Jet fuel', products: ['EPJK'], supplied: 'EPJK' },
] as const;
export type FuelId = (typeof FUELS)[number]['id'];
/** Fuel ethanol: blended into gasoline in the region, so it counts as part of gasoline's supply. */
export const ETHANOL_PRODUCT = 'EPOOXE';
/** What the region view shows: a refined fuel, or the crude its refineries run (M6). Gasoline first. */
export const REGION_FUELS = ['gasoline', 'diesel', 'jet', 'crude'] as const;
export type RegionFuel = (typeof REGION_FUELS)[number];
export const DEFAULT_REGION_FUEL: RegionFuel = 'gasoline';
export const REGION_FUEL_LABELS: Record<RegionFuel, string> = {
  gasoline: 'Gasoline',
  diesel: 'Diesel and heating oil',
  jet: 'Jet fuel',
  crude: 'Crude',
};

export const DATASET_FRESHNESS: Record<
  string,
  { label: string; scheduled: boolean; staleAfterHours?: number; publisher?: string }
> = {
  'chokepoint-transits': { label: 'Chokepoint transits', scheduled: true, staleAfterHours: 18, publisher: 'IMF PortWatch' },
  'port-calls': { label: 'Port calls', scheduled: true, staleAfterHours: 18, publisher: 'IMF PortWatch' },
  'gas-flows': { label: 'Gas flows', scheduled: true, staleAfterHours: 36, publisher: 'ENTSOG Transparency Platform' },
  'gas-storage': { label: 'Gas storage', scheduled: true, staleAfterHours: 36, publisher: 'GIE AGSI+' },
  'gas-storage-us': { label: 'US gas storage', scheduled: true, staleAfterHours: 36, publisher: 'EIA' },
  'gas-storage-ca': { label: 'Canada gas storage', scheduled: true, staleAfterHours: 36, publisher: 'Statistics Canada' },
  'gas-storage-jodi': { label: 'Gas storage, other countries', scheduled: true, staleAfterHours: 36, publisher: 'JODI-Gas' },
  'lng-sendout': { label: 'LNG send-out', scheduled: true, staleAfterHours: 36, publisher: 'GIE ALSI' },
  countries: { label: 'Countries', scheduled: false, publisher: 'Natural Earth' },
  'country-regions': { label: 'Country regions', scheduled: false, publisher: 'Natural Earth' },
  pipelines: { label: 'Pipelines', scheduled: false, publisher: 'Global Energy Monitor' },
  'lng-terminals': { label: 'LNG terminals', scheduled: false, publisher: 'Global Energy Monitor' },
  'oil-terminals': { label: 'Oil terminals', scheduled: false, publisher: 'Curated; locations from IMF PortWatch and Global Energy Monitor' },
  chokepoints: { label: 'Chokepoints', scheduled: false, publisher: 'IMF PortWatch and EIA' },
  basins: { label: 'Basins', scheduled: false, publisher: 'USGS' },
  disruptions: { label: 'Disruptions', scheduled: false },
  'news-headlines': { label: 'News headlines', scheduled: true, staleAfterHours: 12, publisher: 'GDELT and Google News' },
  'oil-origins': { label: 'US crude origins', scheduled: true, staleAfterHours: 72, publisher: 'EIA' },
  'fuel-origins': { label: 'US fuel origins', scheduled: true, staleAfterHours: 72, publisher: 'EIA' },
  'oil-routes': { label: 'Oil export routes', scheduled: false },
  'crude-imports': { label: 'Crude imports by country', scheduled: true, staleAfterHours: 36, publisher: 'Eurostat, UN Comtrade and EIA' },
  'us-lookup': { label: 'US places', scheduled: false, publisher: 'U.S. Census Bureau, EIA and Natural Earth' },
  'us-regions': { label: 'US fuel regions', scheduled: false, publisher: 'U.S. Census Bureau and EIA' },
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

/**
 * Phones (decided 2026-10-31): below `maxWidthPx` the map fills the screen, the panel is a bottom
 * sheet at three heights (peek, half, full) and the rail is a tab bar. Tablets keep the desktop layout.
 */
export const MOBILE = {
  maxWidthPx: 720,
  /** Hidden: only the handle shows, so the map has the screen (added 2026-11-02). */
  hiddenPx: 28,
  /** The handle and the top of the panel: on Home, "What's happening" down to the latest disruption's name. */
  peekPx: 192,
  /** Half: this share of the space above the tab bar. */
  halfShare: 0.5,
  /** Full stops this far below the search bar. */
  gapBelowHeaderPx: 8,
  /** Room the filter chips take under the search bar, kept clear when framing the map. */
  chipsPx: 56,
  /** Padding around what the map frames; the desktop's FIT_PADDING leaves no room above a half sheet. */
  fitPaddingPx: 16,
  /** Below this much map left showing (at full), the camera holds still rather than framing a sliver. */
  minFramePx: 120,
  /** A drag shorter than this is a tap. */
  dragThresholdPx: 6,
  /** How far ahead a flick's speed carries the sheet before it snaps, in ms of travel. */
  flickMs: 160,
  /**
   * Pixel density the map draws at, at most. Phones are 3x; at 2x thin lines stay sharp and the GPU
   * fills 55% fewer pixels a frame.
   */
  maxPixelRatio: 2,
} as const;

/** Origin arcs in a region view: width in px from the smallest share shown to the whole supply. */
export const ORIGIN_ARC = { minPx: 1.5, maxPx: 14 } as const;

/**
 * The fuel regions as outlines, the only thing on the map on the fuel origins surface and in a
 * region view (decided 2026-10-30). Alphas are of the map's ink.
 */
export const REGION_OUTLINE = { fillAlpha: 0.05, selectedFillAlpha: 0.12, lineAlpha: 0.5, linePx: 1.5, selectedLinePx: 3, labelPx: 13, labelMinZoom: 2.5 } as const;

/** Zoom used when flying to a point feature. */
export const POINT_FOCUS_ZOOM = 6;

/**
 * Features that are built but switched off. `visitChanges` ("What changed since last visit") keeps a
 * snapshot of the data in this browser's localStorage between visits; off, nothing is stored, any
 * stored snapshot is removed, and Home leaves out the count and the list (decided 2026-10-31).
 *
 * `gasStorage` and `fuelOrigins` (the oil origins surface) were held back until they reached past the EU
 * and the US (decided 2026-11-01); M10 took both worldwide and turned them on. Off, a surface leaves the
 * rail and search, its links open Home, its map layer stays off, and Home leaves out its figure. Their
 * scheduled fetches keep running.
 */
export const FEATURES = {
  visitChanges: false,
  gasStorage: true,
  fuelOrigins: true,
} as const;

/**
 * The phone tab bar (SPEC M10): at most this many slots, Home included. With more sections on, the last
 * slot is More, and the bar keeps the sections with the most live state, in this order.
 */
export const PHONE_TABS = { slots: 5, bar: ['chokepoints', 'pipelines', 'terminals'] } as const;

/** The basins surface draws the outlines stronger, with a faint fill, and names them sooner. */
export const BASIN_FOCUS = { labelMinZoom: 3 } as const;

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

/**
 * Search: how many matches to rank, how many each kind shows when searching everything, and how
 * many show when narrowed to one kind.
 */
export const SEARCH = { limit: 80, perGroup: 4, scopedLimit: 30 } as const;

/** Quick filters: how faint non-matching assets get, and how many matches the panel lists. */
export const FILTERS = { fadeAlpha: 0.12, listLimit: 300 } as const;

/** Detail views: how many related assets show before "Show all". */
export const DETAIL = { relatedLimit: 6 } as const;

/**
 * The pipelines surface: owners with their own group (the rest share "Other owners"), and how many
 * pipelines an open group lists before "Show all".
 */
export const PIPELINE_GROUPS = { ownerGroups: 30, listLimit: 50 } as const;

/** The terminals surface: LNG terminals listed per open group before "Show all". */
export const TERMINAL_GROUPS = { listLimit: 50 } as const;

/**
 * Home's hero: `cards` disruptions in effect, newest report first, as a row of cards; then the rest and
 * the measured changes, each listing a few before "Show all". A report date up to `recentDays` old reads
 * as "3 days ago"; older ones as the date.
 */
export const HOME_HERO = { cards: 5, disruptionsShown: 3, changesShown: 3, recentDays: 14 } as const;

/**
 * Measured changes on Home (SPEC M8): the latest `recentDays` of a series against the `priorDays`
 * before them. A series whose latest point is older than `maxAgeDays` is left out. Chokepoint transits
 * count when they move by `minRelative` on a prior mean of at least `minPriorMean` a day; pipelines when
 * they stop, resume or move `CHANGES.flowSharePts` points of capacity; LNG send-out only when it stops
 * or resumes, since it follows cargo arrivals and swings widely from week to week.
 */
export const MEASURED_CHANGES = {
  recentDays: 7,
  priorDays: 28,
  minRecentPoints: 5,
  minPriorPoints: 20,
  maxAgeDays: 14,
  transits: { minRelative: 0.25, minPriorMean: 3 },
} as const;

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
    // Added 2026-11-03 so the news scan's drafts from outlets that break these stories reach Home.
    'pbs.org',
    'bbc.com',
    'bbc.co.uk',
    'ft.com',
    'wsj.com',
    'cnbc.com',
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

/**
 * News scan (jobs/scan-news.ts, SPEC M9), every 3 hours. Headlines from GDELT and Google News RSS over
 * the last `lookbackDays` are matched to mapped assets by name. An asset's new articles form a story;
 * a story is a candidate when `minPublishers` outlets carry it, a trusted domain does, or the asset shows
 * a measured change. Claude drafts from the article pages, and code checks each draft as for claims.
 * Drafting stops once a run's estimated cost passes `maxCostPerRunUsd`. Disruptions with no report in
 * STALE_AFTER_DAYS, or whose measured flow has recovered, get a search for an end report at most every
 * `endCheckDays`, `maxEndChecksPerRun` at a time.
 */
/**
 * A headline's map thumbnail (`src/lib/thumbnail.ts`, added 2026-11-05): a square `size` units across framing
 * up to `maxAssets` of the places it names, with `padding` of the span on each side, never narrower than
 * `minSpanDeg` (so a single terminal shows its coast). Outline points closer than `step` units are dropped.
 */
export const THUMBNAIL = {
  size: 64,
  maxAssets: 3,
  padding: 0.2,
  minSpanDeg: 4,
  step: 0.6,
} as const;

export const NEWS = {
  lookbackDays: 3,
  /**
   * A new disruption is published without review (marked unreviewed, decided 2026-11-03) when this many
   * outlets carry the story, the drafted page is a trusted one, it started within `newDisruptionMaxAgeDays`,
   * and the asset shows no disruption in effect. Anything else, and every end date, waits for review.
   */
  newDisruptionPublishers: 2,
  /**
   * "In the news", on Home and each asset's detail (per asset added 2026-11-04): headlines are kept for
   * `headlineDays`, run to run. The file holds the newest `headlinesKept`, and every asset's newest
   * `headlinesPerAsset` with them; Home shows `headlinesShown`, a detail up to `headlinesPerAsset`.
   */
  headlineDays: 14,
  headlinesKept: 40,
  headlinesPerAsset: 5,
  headlinesShown: 6,
  /**
   * Publisher icons beside the headlines (added 2026-11-05), saved to public/favicons/ by the scan so the page
   * never calls a publisher: up to `faviconsPerRun` new sites a run, each icon under `faviconMaxBytes`; a site
   * without one is tried again after `faviconRetryDays`.
   */
  faviconsPerRun: 30,
  faviconMaxBytes: 100_000,
  faviconRetryDays: 14,
  faviconTimeoutMs: 8_000,
  /** Left out of the headlines: social posts, reference pages and press release wires (subdomains count). */
  headlineSkipDomains: [
    'facebook.com',
    'x.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
    'youtube.com',
    'linkedin.com',
    'reddit.com',
    'britannica.com',
    'wikipedia.org',
    'prnewswire.com',
    'globenewswire.com',
    'businesswire.com',
    'accessnewswire.com',
    'financialcontent.com',
    // Live scores: a club named Bratstvo or Druzhba is not the pipeline (2026-11-04).
    'sofascore.com',
    'flashscore.com',
    'livescore.com',
  ],
  newDisruptionMaxAgeDays: 7,
  /** Articles published longer ago than this can't be drafted from, however recently a feed listed them. */
  maxArticleAgeDays: 14,
  minPublishers: 2,
  maxStoriesPerRun: 20,
  maxCostPerRunUsd: 0.25,
  /** Article pages read per story, and how much of each page's text Claude sees. */
  pagesPerStory: 3,
  pageChars: 12_000,
  /** Searches allowed when a story's only links are Google News redirects, limited to its publishers' sites. */
  maxSearches: 2,
  endCheckDays: 7,
  maxEndChecksPerRun: 3,
  maxEndSearches: 3,
  /** Long-settled stops; searching weekly for their end won't find one. */
  endCheckSkip: [
    'ukraine-transit-end-2025-upu',
    'ukraine-transit-end-2025-progress',
    'soyuz-2022-sokhranivka',
    'druzhba-north-2023-poland-halt',
    'gme-2021-algeria-halt',
  ],
  /** Seen article keys are kept this long, so the same headline is never drafted from twice. */
  seenDays: 21,
  /** Google News failing this many runs in a row turns the run red; each run still tries it first. */
  googleNewsMaxFailures: 3,
  /** Terms per feed query, and the gap GDELT asks for between requests. */
  termsPerQuery: 8,
  /** GDELT asks for 5 seconds between requests but answers 429 at that pace; a 429 waits `gdeltBackoffMs`. */
  gdeltGapMs: 8_000,
  gdeltBackoffMs: 30_000,
  /** A feed failing this many queries in a row is skipped for the rest of the run. */
  maxFailuresInARow: 3,
  googleGapMs: 1_500,
  requestTimeoutMs: 40_000,
  /** Names news uses for chokepoints, which their display names don't give. */
  extraTerms: {
    // Places in or on the strait (added 2026-11-03: a strike on Qeshm named none of the mapped assets).
    'chokepoint/hormuz': ['Hormuz', 'Qeshm', 'Bandar Abbas', 'Larak', 'Musandam'],
    'chokepoint/malacca': ['Malacca Strait'],
    'chokepoint/suez': ['Suez Canal'],
    'chokepoint/babelm': ['Bab al-Mandab', 'Red Sea', 'Houthi', 'Houthis'],
    'chokepoint/danish': ['Great Belt', 'Oresund'],
    'chokepoint/turkish': ['Bosphorus', 'Bosporus', 'Dardanelles'],
    'pipeline/sumed': ['SUMED pipeline'],
  } as Record<string, string[]>,
  /** Parts of display names that aren't names ("Druzhba (northern branch)"). */
  dropTerms: [
    'northern branch',
    'southern branch',
    'suez canal and sumed',
    'yamburg western border',
    'egypt jordan',
    'jordan syria',
    'orenburg western border',
    'suez mediterranean',
  ],
  /**
   * Names that are also common words, places or tickers: they count only in a headline that also has an
   * energy word. Short acronyms (four letters or fewer) always do.
   */
  weakTerms: [
    'bandar abbas',
    'red sea',
    'houthi',
    'houthis',
    'druzhba',
    'progress',
    'brotherhood',
    // Brotherhood in Serbian and Macedonian, and a football club's name (FK Bratstvo, 2026-11-04).
    'bratstvo',
    'soyuz',
    'friendship pipeline',
    'basra',
    'yanbu',
    // Also a river and a town (a car in the Ceyhan River, 2026-11-04).
    'ceyhan',
    // Towns, an emirate and a resort as well as terminals (2026-11-04, before headlines showed on each
    // asset). Their longer names ("Port of Fujairah", "Primorsk oil terminal") still match alone.
    'fujairah',
    'novorossiysk',
    'primorsk',
    'covenas',
    'coveñas',
    'balao',
    'ain sokhna',
    'ain sukhna',
    'el sokhna',
    'esmeraldas',
    'punta gorda',
    'corpus christi',
    'bonny',
    'liza',
    'enrico mattei',
    'suez canal',
    'panama canal',
    'great belt',
    'oresund',
    'bosphorus',
    'bosporus',
    'dardanelles',
    'baltic pipeline system',
    // Also a US fiber and cable company (2026-11-04).
    'blue stream',
  ],
} as const;

/**
 * The header's globe mark: `dots` across a disc of `size` px, each dot `dotPx` wide, turning once every
 * `secondsPerTurn` and stepping `fps` times a second, like an LED panel rather than a smooth spin.
 * The land mask is sampled every `maskCell` degrees (import:globe). The favicon is one still frame with
 * fewer, larger dots, so they hold at 16 px. The social card (render:og) is a still frame with more dots,
 * `px` wide, centred on the Gulf.
 */
export const GLOBE = {
  size: 24,
  dots: 16,
  dotPx: 1,
  secondsPerTurn: 24,
  fps: 8,
  tilt: 18,
  maskCell: 2,
  favicon: { dots: 10, lon: 10, fill: 0.72, oceanOpacity: 0.3 },
  /** Over the map while the data loads (MapLoading). */
  loader: { size: 88, dots: 22, fill: 0.62, secondsPerTurn: 10, fadeMs: 400 },
  /** The menu's hero; `phoneSize` below MOBILE.maxWidthPx. */
  hero: { size: 280, phoneSize: 168, dots: 52, fill: 0.62, secondsPerTurn: 36 },
  og: { dots: 40, lon: 40, fill: 0.62, oceanOpacity: 0.16, px: 470, focusLandOpacity: 0.62, focusOceanOpacity: 0.1 },
} as const;

/** Who runs the site, for the menu's footer. Corrections and takedown requests come to `contactEmail`. */
export const SITE = {
  name: 'Petro Sprawl',
  tagline: 'The sprawling empire of the petro-state',
  contactEmail: 'hello@petrosprawl.fyi',
  maker: { name: 'Roby Saavedra', url: 'https://robysaavedra.com' },
} as const;

/**
 * Link previews (share cards): what a shared link shows in a chat or a post. A point lights the mask cells
 * within `pointRadiusDeg`; a line or shape too small to light `minCells` cells gets a point's ring as well,
 * so it shows on a globe whose dots are about 4.5° apart. The
 * card names its largest `topSources` origins. Each surface's card centres the globe on `viewCenters`.
 */
export const SHARE = {
  pointRadiusDeg: 5,
  minCells: 24,
  topSources: 3,
  /** Most cells a surface's card lights, so the index stays small. */
  maxViewCells: 4000,
  viewCenters: {
    chokepoints: [55, 22],
    pipelines: [40, 48],
    terminals: [30, 30],
    basins: [40, 30],
    storage: [20, 50],
    origins: [10, 30],
  } as Record<string, [number, number]>,
} as const;

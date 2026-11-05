// Shared data model (SPEC section 6). Used by the app and the data jobs.

import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

export type Commodity = 'gas' | 'oil' | 'products' | 'ngl';

export type AssetStatus =
  | 'operating'
  | 'reduced'
  | 'offline'
  | 'idle'
  | 'planned'
  | 'under_construction'
  | 'cancelled'
  | 'unknown';

export interface Evidence {
  status: AssetStatus;
  sourceType: 'operator' | 'regulator' | 'government' | 'press' | 'dataset' | 'measured';
  statement?: string;
  url?: string;
  observedAt: string;
  recordedAt: string;
  /** Committed by the claims refresh without a person checking it (its source is off the trusted list); delete to mark reviewed. */
  unreviewed?: true;
}

export interface Pipeline {
  id: string;
  name: string;
  aliases: string[];
  /** The system this is one section of, when GEM splits it ("Druzhba Oil Pipeline"); sections share it. */
  system?: string;
  commodity: Commodity;
  fromCountry: string;
  toCountry: string;
  transitCountries: string[];
  operator?: string;
  owners?: Company[];
  capacity?: { value: number; unit: 'bcm/yr' | 'mb/d' };
  /** Cited source when a curated record sets the capacity; GEM capacities cite GEM. */
  capacitySource?: SourceRef | PageRef;
  /** Cited source when a curated record sets the owners; GEM owners cite GEM. */
  ownersSource?: PageRef;
  /** Ultimate parent companies behind the owners, as GEM traces them. */
  parents?: Company[];
  history?: PipelineHistory;
  /** GEM's known length, or its estimate from the mapped route. */
  lengthKm?: { value: number; estimated: boolean };
  /** As GEM gives it, one figure per section: "30, 42 in". */
  diameter?: string;
  /** Named places the line starts and ends at, as GEM gives them. */
  endpoints?: { start?: string; end?: string };
  geometry: LineString | MultiLineString;
  geometryApprox: boolean;
  evidence: Evidence[];
  flowSeriesId?: string;
  sources: string[];
}

/** A reference page with no publication date, such as an operator's shareholder list. */
export interface PageRef {
  publisher: string;
  title: string;
  url: string;
  /** ISO date the page was read. */
  accessedAt: string;
}

/** When a pipeline was proposed, built and put in service, from GEM. */
export interface PipelineHistory {
  /** Years sections entered service, ascending. Targets rather than history when `expected`. */
  startYears: number[];
  /** GEM lists the line as proposed or under construction, so the start years are planned dates. */
  expected: boolean;
  proposalYear?: number;
  constructionYear?: number;
  /** Year the line stopped running, when GEM records one. */
  stopYear?: number;
}

/** One unit of an LNG terminal (a liquefaction train or a regasification unit), as GEM lists it. */
export interface LngUnit {
  name?: string;
  status: AssetStatus;
  /** GEM's capacity in million tonnes a year, when it gives one. */
  capacityMtpa?: number;
  startYear?: number;
}

/**
 * GEM LNG terminal: the units of one GEM project and facility type, grouped. Added after v0.1
 * (SPEC section 6); status comes from the units, as a dataset claim.
 */
export interface LngTerminal {
  id: string;
  name: string;
  aliases: string[];
  facility: 'export' | 'import';
  /** ISO code, or empty when GEM's name for the place has none. */
  country: string;
  point: [number, number];
  /** GEM marks the location approximate. */
  pointApprox: boolean;
  floating: boolean;
  offshore: boolean;
  operator?: string;
  owners?: Company[];
  /** Million tonnes a year: units operating, and units under construction or proposed. */
  capacityMtpa: { operating: number; planned: number };
  units: LngUnit[];
  evidence: Evidence[];
  /** Daily send-out from GIE ALSI, for EU import terminals ALSI reports. */
  sendOutSeriesId?: string;
}

/**
 * A curated crude oil terminal: where a pipeline meets the sea, or a major export port. Every claim
 * cites a source; with no claim the status is unknown. Not in SPEC section 6; added after M5.
 */
export interface OilTerminal {
  id: string;
  name: string;
  aliases: string[];
  /** Export terminals load crude; import terminals receive it (Ain Sokhna feeds SUMED, LOOP serves US refiners). */
  role: 'export' | 'import';
  /** ISO 3166-1 alpha-2 */
  country: string;
  point: [number, number];
  /** Where the location comes from: a PortWatch port, or the end of a GEM pipeline route. */
  pointSource: { publisher: string; detail: string };
  /** The source's point is near, not at, the terminal. */
  pointApprox?: boolean;
  operator?: string;
  /** Pipelines that end at the terminal. */
  pipelineIds: string[];
  /** Chokepoints a tanker leaving the terminal passes before open sea, in either direction it can take. */
  exitVia: ChokepointId[];
  /** Cited loadings over a stated period, as context; not capacity. */
  throughput?: { value: number; unit: 'mb/d'; period: string; source: SourceRef };
  /** PortWatch port id, when Daily_Ports_Data reports tanker calls there (PORT_CALLS). */
  portwatchId?: string;
  /** Newest first. Empty when nothing could be sourced. */
  evidence: Evidence[];
}

export type ChokepointId = 'hormuz' | 'malacca' | 'suez' | 'babelm' | 'danish' | 'turkish' | 'panama';

export interface Chokepoint {
  id: ChokepointId;
  name: string;
  point: [number, number];
  eiaReferenceMbd: number;
  transitSeriesId: string;
}

/** An owner or parent company and its share. `url` is its home page as GEM's ownership tracker gives it. */
export interface Company {
  name: string;
  sharePct?: number;
  url?: string;
}

/** USGS World Petroleum Assessment 2000 province. Not in SPEC section 6; added in M1. */
export interface Basin {
  id: string;
  code: number;
  name: string;
  provinceType: 'priority' | 'boutique';
  /** USGS O_G field: the province's dominant petroleum type, when given. */
  dominant: 'oil' | 'gas' | null;
  /** A point guaranteed inside the polygon, for labels. [lon, lat] */
  labelPoint: [number, number];
  /** ISO 3166-1 alpha-2 codes of countries whose land the province overlaps. Empty offshore. */
  countries: string[];
  /** Volumes as assessed in 2000: oil in million barrels, gas in billion cubic feet. Null when none is given. */
  volumes: { oil: BasinVolumes; gas: BasinVolumes } | null;
  geometry: Polygon | MultiPolygon;
}

/**
 * One commodity's volumes in a USGS province. Produced and remaining are for discovered fields, from a 1996
 * industry database; undiscovered is the assessment's mean estimate. Null where USGS gives no value or an
 * inconsistent (negative) one.
 */
export interface BasinVolumes {
  produced: number | null;
  remaining: number | null;
  undiscovered: number | null;
}

/** A country outline, for the storage layer and search. From Natural Earth 1:50m admin-0. */
/** A PADD as an outline: its states merged into one shape (Census 1:20m). For the fuel origins map. */
export interface UsRegion {
  id: PaddRef;
  name: string;
  /** Inside the region's contiguous states, where its name goes. */
  labelPoint: [number, number];
  /** West-south and east-north corners of the contiguous states, what the map frames. */
  frame: [[number, number], [number, number]];
  geometry: Polygon | MultiPolygon;
}

/** Which World Bank region a country is in, as Natural Earth records it. For grouping pipelines by region. */
export interface CountryRegion {
  /** ISO 3166-1 alpha-2 */
  id: string;
  name: string;
  region: string;
}

export interface Country {
  /** ISO 3166-1 alpha-2 */
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
}

export interface ObservationSeries {
  id: string;
  metric: 'tanker_transits' | 'tanker_port_calls' | 'tanker_cargo_t' | 'tanker_exports_t' | 'gas_flow_kwh_d' | 'storage_fill_pct' | 'storage_gas_volume' | 'lng_sendout_kwh_d';
  unit: string;
  points: { date: string; value: number }[];
  capacity?: number;
  /** Where the series is measured, for display: an ENTSOG point and operator, or an ALSI facility. */
  label?: string;
  /** JODI's assessment of the latest value: use with caution. */
  caution?: true;
  /** Long-run reference computed by the job from history not kept in points. Added in M3. */
  fiveYear?: BaselineStat;
}

export interface BaselineStat {
  mean: number;
  from: string;
  to: string;
  count: number;
}

/**
 * A headline the news scan matched to mapped assets, for Home's "In the news" (added 2026-11-03). Shown as
 * the feed gave it, with a link, and labelled unreviewed: nothing here has been checked against the page.
 */
export interface NewsHeadline {
  title: string;
  publisher: string;
  /** The article for GDELT; a Google News link that redirects to it for Google News. */
  url: string;
  /** YYYY-MM-DD, as the feed reports it. */
  publishedAt: string;
  feed: 'gdelt' | 'google-news';
  /** The assets it names, as `<kind>/<id>`. */
  refs: string[];
}

export interface SourceRef {
  publisher: string;
  title: string;
  url: string;
  /** ISO date the source was published. */
  publishedAt: string;
  /** Added by the news scan (M9) without a person checking it; the page says so beside the link. */
  unreviewed?: true;
}

/**
 * A dated, sourced account of an asset being disrupted. Extended from SPEC section 6 in M3:
 * assetKind, a list of sources instead of one url, and recordedAt.
 */
export interface Disruption {
  id: string;
  assetKind: 'pipeline' | 'chokepoint' | 'lng' | 'terminal';
  assetId: string;
  /** ISO date or month; month when sources don't give a day. */
  startedAt: string;
  endedAt?: string;
  cause: 'sabotage' | 'sanction' | 'maintenance' | 'commercial' | 'conflict' | 'accident' | 'other';
  /** Our own words, paraphrasing the sources. Attributes contested claims to whoever made them. */
  summary: string;
  sources: SourceRef[];
  recordedAt: string;
}

export interface DatasetMeta {
  id: string;
  /** When the published file was last successfully produced. */
  fetchedAt: string;
  recordCount: number;
  sourceUrl: string;
  sourceVersion?: string;
  license: string;
  /** Latest observation date in the data, for time series. Added in M2. */
  dataThrough?: string;
  /** The most recent run, successful or not. A failure leaves fetchedAt and the data file unchanged. Added in M2. */
  lastAttempt?: { at: string; ok: boolean; error?: string };
}

/** One month of a PADD's crude supply, in thousand barrels (EIA). */
export interface CrudeMonth {
  period: string;
  /** Crude run by the region's refineries and blenders. */
  refineryInput: number;
  /** Foreign crude processed in the region, by country of origin. */
  imports: { code: string; name: string; kbbl: number }[];
  /** Crude received from other PADDs, with the split by mode where EIA reports it. */
  receipts: { from: PaddRef; kbbl: number; pipeline: number; tankerBarge: number; rail: number }[];
  /** Crude pumped in the region, by state or federal offshore area. */
  production: { area: string; kbbl: number }[];
}

export type PaddRef = 'padd-1' | 'padd-2' | 'padd-3' | 'padd-4' | 'padd-5';

export interface OilOriginRegion {
  id: PaddRef;
  name: string;
  months: CrudeMonth[];
  /** Operable refineries and atmospheric crude distillation capacity, as of 1 January of `asOf`. */
  capacity?: { asOf: string; refineries: number; barrelsPerCalendarDay: number };
}

/** One month of a PADD's supply of one refined fuel, in thousand barrels (EIA). */
export interface FuelMonth {
  period: string;
  /** EIA "product supplied": what the region used. */
  supplied: number;
  /** Imports into the region, by country. */
  imports: CrudeMonth['imports'];
  /** Received from other PADDs, with the split by mode. */
  receipts: CrudeMonth['receipts'];
  /** Gasoline only: fuel ethanol received from other PADDs and imported, blended in the region. */
  ethanol?: { receipts: CrudeMonth['receipts']; imports: CrudeMonth['imports'] };
}

export interface FuelOriginRegion {
  /** "padd-1/gasoline". */
  id: string;
  region: PaddRef;
  fuel: 'gasoline' | 'diesel' | 'jet';
  months: FuelMonth[];
}

/** Lookup tables for "Where is my oil from?": built once by import:us-lookup, read in the browser only. */
export interface UsLookup {
  /** State names; zipRanges point into this list. */
  states: string[];
  /** Runs of ZCTAs in one state: [first ZIP, last ZIP, index into states]. */
  zipRanges: [number, number, number][];
  cities: { name: string; state: string }[];
  /** Schematic map point per PADD, where route arcs end. */
  hubs: Record<PaddRef, [number, number]>;
  /** Natural Earth label point by ISO 3166-1 alpha-3 code, where route arcs start. */
  countryPoints: Record<string, [number, number]>;
}

/** Where one country's crude can leave from (data/curated/oil-routes.json). Chokepoints come from the terminals' exitVia. */
export interface OilRoute {
  country: string;
  terminals: string[];
  note: string;
  sources: SourceRef[];
}

/** One country's crude imports by partner over its latest window (SPEC M10). */
export interface CountryCrudeImports {
  /** Reporter, ISO 3166 alpha-2. */
  id: string;
  /** Reporter, ISO 3166 alpha-3, for its label point on the map. */
  iso3: string | null;
  /** EIA for the United States, from M6's data. */
  source: 'eurostat' | 'comtrade' | 'eia';
  /** Shares by net weight, or by value where the reporter gives no weight. */
  basis: 'weight' | 'value';
  unit: 'thousand tonnes' | 'tonnes' | 'US$' | 'thousand barrels';
  /** First and last period: "2025-09" to "2026-08", or "2025" to "2025" for a year. */
  from: string;
  to: string;
  /** Months with a reported total inside the window (Eurostat); null for a year. */
  monthsReported: number | null;
  total: number;
  /** Largest first. Groups Eurostat or Comtrade don't split by country have no codes. */
  partners: { iso2: string | null; iso3: string | null; label: string; value: number }[];
  /** Comtrade's value of the country's crude imports in its latest year, for ranking. */
  importsUsd: { year: string; value: number } | null;
  /** The date the partner rows were retrieved from the source (Comtrade's are reused for a week). */
  retrieved: string;
}

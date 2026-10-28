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
}

export interface Pipeline {
  id: string;
  name: string;
  aliases: string[];
  commodity: Commodity;
  fromCountry: string;
  toCountry: string;
  transitCountries: string[];
  operator?: string;
  owners?: { name: string; sharePct?: number }[];
  capacity?: { value: number; unit: 'bcm/yr' | 'mb/d' };
  geometry: LineString | MultiLineString;
  geometryApprox: boolean;
  evidence: Evidence[];
  flowSeriesId?: string;
  sources: string[];
}

export type ChokepointId = 'hormuz' | 'malacca' | 'suez' | 'babelm' | 'danish' | 'turkish' | 'panama';

export interface Chokepoint {
  id: ChokepointId;
  name: string;
  point: [number, number];
  eiaReferenceMbd: number;
  transitSeriesId: string;
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
  geometry: Polygon | MultiPolygon;
}

export interface ObservationSeries {
  id: string;
  metric: 'tanker_transits' | 'gas_flow_kwh_d' | 'storage_fill_pct';
  unit: string;
  points: { date: string; value: number }[];
  capacity?: number;
  /** Long-run reference computed by the job from history not kept in points. Added in M3. */
  fiveYear?: BaselineStat;
}

export interface BaselineStat {
  mean: number;
  from: string;
  to: string;
  count: number;
}

export interface SourceRef {
  publisher: string;
  title: string;
  url: string;
  /** ISO date the source was published. */
  publishedAt: string;
}

/**
 * A dated, sourced account of an asset being disrupted. Extended from SPEC section 6 in M3:
 * assetKind, a list of sources instead of one url, and recordedAt.
 */
export interface Disruption {
  id: string;
  assetKind: 'pipeline' | 'chokepoint';
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

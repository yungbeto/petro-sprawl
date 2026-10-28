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
  geometry: Polygon | MultiPolygon;
}

export interface ObservationSeries {
  id: string;
  metric: 'tanker_transits' | 'gas_flow_kwh_d' | 'storage_fill_pct';
  unit: string;
  points: { date: string; value: number }[];
  capacity?: number;
}

export interface Disruption {
  assetId: string;
  startedAt: string;
  endedAt?: string;
  cause: 'sabotage' | 'sanction' | 'maintenance' | 'commercial' | 'conflict' | 'accident' | 'other';
  summary: string;
  url?: string;
}

export interface DatasetMeta {
  id: string;
  fetchedAt: string;
  recordCount: number;
  sourceUrl: string;
  sourceVersion?: string;
  license: string;
}

// Pure transforms from GEM Global Gas / Oil Infrastructure Tracker pipeline rows to Pipeline records.

import type { Geometry, LineString, MultiLineString, Position } from 'geojson';
import type { AssetStatus, Commodity, Evidence, Pipeline } from '../../src/types';
import { countryToIso } from './countries';

/** The GEM fields the import reads. Both trackers share these names. */
export interface GemRow {
  ProjectID: string;
  PipelineName: string;
  SegmentName?: string;
  Wiki?: string;
  Status: string;
  LastUpdated?: string;
  Fuel: string;
  OtherEnglishNames?: string;
  OtherLanguagePrimaryPipelineName?: string;
  CountriesOrAreas: string;
  StartCountryOrArea: string;
  EndCountryOrArea: string;
  Owner?: string;
  'CapacityBcm/y'?: string;
  CapacityBOEd?: string;
  RouteAccuracy: string;
  RouteType: string;
}

/** GEM status to ours. GEM's own word is kept in the evidence statement. */
const STATUS: Record<string, AssetStatus> = {
  operating: 'operating',
  proposed: 'planned',
  construction: 'under_construction',
  cancelled: 'cancelled',
  idle: 'idle',
  mothballed: 'idle',
  retired: 'offline',
  shelved: 'unknown',
  'mixed status': 'unknown',
};

/** Rows we don't import: never built, or paused with no route forward. */
export const EXCLUDED_STATUSES = new Set(['cancelled', 'shelved']);

/** Rows describing work on another row's line; drawing them would double the line. */
export const EXCLUDED_ROUTE_TYPES = new Set([
  'Capacity expansion only',
  'Bidirectionality upgrade only',
  'Included in other ProjectID',
]);

export function mapGemStatus(raw: string): AssetStatus {
  return STATUS[raw.trim().toLowerCase()] ?? 'unknown';
}

export function gemCommodity(fuel: string): Commodity | null {
  switch (fuel.trim().toLowerCase()) {
    case 'gas':
      return 'gas';
    case 'oil':
      return 'oil';
    case 'ngl':
      return 'ngl';
    default:
      return null;
  }
}

/** "Summit Midstream [70.00%]; ExxonMobil [30.00%]" -> owners with shares where given. */
export function parseOwners(raw: string | undefined): { name: string; sharePct?: number }[] {
  if (!raw?.trim()) return [];
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(part);
      if (!match) return { name: part };
      const share = parseFloat(match[2]!.replace('%', ''));
      return Number.isFinite(share) ? { name: match[1]!, sharePct: share } : { name: match[1]! };
    });
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Gas in bcm/yr from GEM's own conversion; oil and NGL in mb/d from GEM's barrels of oil equivalent per day. */
export function gemCapacity(row: GemRow, commodity: Commodity): Pipeline['capacity'] {
  if (commodity === 'gas') {
    const bcm = parseNumber(row['CapacityBcm/y']);
    return bcm === null ? undefined : { value: bcm, unit: 'bcm/yr' };
  }
  const boed = parseNumber(row.CapacityBOEd);
  return boed === null ? undefined : { value: Math.round((boed / 1e6) * 1000) / 1000, unit: 'mb/d' };
}

/** Keeps only line parts; returns null when nothing drawable is left. */
export function lineGeometry(geometry: Geometry | null): LineString | MultiLineString | null {
  if (!geometry) return null;
  const lines: Position[][] = [];
  const collect = (g: Geometry) => {
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(collect);
  };
  collect(geometry);
  const usable = lines.filter((l) => l.length >= 2);
  if (usable.length === 0) return null;
  return usable.length === 1
    ? { type: 'LineString', coordinates: usable[0]! }
    : { type: 'MultiLineString', coordinates: usable };
}

function splitList(raw: string | undefined, separator: RegExp): string[] {
  return (raw ?? '')
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface GemImportContext {
  /** ISO date the import ran, for Evidence.recordedAt. */
  recordedAt: string;
  /** Tracker release month (YYYY-MM), used when a row has no LastUpdated. Not padded to a day we don't know. */
  releaseDate: string;
  sourceId: string;
}

export type GemRowResult =
  | { ok: true; pipeline: Pipeline; unresolvedCountries: string[] }
  | { ok: false; reason: 'excluded_status' | 'excluded_route_type' | 'no_route' | 'unknown_fuel'; detail?: string };

export function gemRowToPipeline(row: GemRow, geometry: Geometry | null, ctx: GemImportContext): GemRowResult {
  const rawStatus = row.Status.trim().toLowerCase();
  if (EXCLUDED_STATUSES.has(rawStatus)) return { ok: false, reason: 'excluded_status', detail: rawStatus };
  if (EXCLUDED_ROUTE_TYPES.has(row.RouteType.trim())) return { ok: false, reason: 'excluded_route_type', detail: row.RouteType };
  const commodity = gemCommodity(row.Fuel);
  if (!commodity) return { ok: false, reason: 'unknown_fuel', detail: row.Fuel };
  const line = lineGeometry(geometry);
  if (!line) return { ok: false, reason: 'no_route' };

  const countryNames = splitList(row.CountriesOrAreas, /[;,]/);
  const names = [row.StartCountryOrArea, row.EndCountryOrArea, ...countryNames].filter(Boolean);
  // Names without an ISO code (such as GEM's "Kuwait-Saudi Arabia" for the former neutral zone)
  // are left out of the country fields and reported, rather than dropping the pipeline.
  const codes = new Map<string, string>();
  const unresolvedCountries: string[] = [];
  for (const name of new Set(names)) {
    const code = countryToIso(name);
    if (code) codes.set(name, code);
    else unresolvedCountries.push(name);
  }
  const fromCountry = codes.get(row.StartCountryOrArea) ?? codes.get(countryNames[0] ?? '') ?? '';
  const toCountry = codes.get(row.EndCountryOrArea) ?? codes.get(countryNames.at(-1) ?? '') ?? '';
  const transitCountries = [...new Set(countryNames.flatMap((n) => codes.get(n) ?? []))].filter(
    (c) => c !== fromCountry && c !== toCountry,
  );

  const segment = row.SegmentName?.trim();
  const evidence: Evidence = {
    status: mapGemStatus(row.Status),
    sourceType: 'dataset',
    statement: `Global Energy Monitor status: ${rawStatus}`,
    ...(row.Wiki?.trim() ? { url: row.Wiki.trim() } : {}),
    observedAt: /^\d{4}-\d{2}-\d{2}$/.test(row.LastUpdated?.trim() ?? '') ? row.LastUpdated!.trim() : ctx.releaseDate,
    recordedAt: ctx.recordedAt,
  };
  const owners = parseOwners(row.Owner);
  const capacity = gemCapacity(row, commodity);

  return {
    ok: true,
    unresolvedCountries,
    pipeline: {
      id: `gem-${row.ProjectID.trim().toLowerCase()}`,
      name: segment ? `${row.PipelineName.trim()} · ${segment}` : row.PipelineName.trim(),
      aliases: [
        ...splitList(row.OtherEnglishNames, /;/),
        ...splitList(row.OtherLanguagePrimaryPipelineName, /;/),
      ],
      commodity,
      fromCountry,
      toCountry,
      transitCountries,
      ...(owners.length ? { owners } : {}),
      ...(capacity ? { capacity } : {}),
      geometry: line,
      // GEM marks rough routes as low accuracy; they render like endpoint-only lines.
      geometryApprox: row.RouteAccuracy.trim().toLowerCase() === 'low',
      evidence: [evidence],
      sources: [ctx.sourceId],
    },
  };
}

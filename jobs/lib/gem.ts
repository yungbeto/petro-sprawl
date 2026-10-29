// Pure transforms from GEM Global Gas / Oil Infrastructure Tracker pipeline rows to Pipeline records.

import type { Geometry, LineString, MultiLineString, Position } from 'geojson';
import type { AssetStatus, Commodity, Evidence, Pipeline, PipelineHistory } from '../../src/types';
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
  Parent?: string;
  StartYear1?: string;
  StartYear2?: string;
  StartYear3?: string;
  /** Oil tracker only. */
  ProposalYear?: string;
  ConstructionYear?: string;
  StopYear?: string;
  LengthKnownKm?: string;
  LengthEstimateKm?: string;
  Diameter?: string;
  DiameterUnits?: string;
  StartLocation?: string;
  EndLocation?: string;
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
  if (boed === null) return undefined;
  // Three decimals of mb/d, except lines under 1,000 b/d, which would round to nothing: two significant figures.
  const mbd = boed / 1e6;
  return { value: mbd >= 0.001 ? Math.round(mbd * 1000) / 1000 : Number(mbd.toPrecision(2)), unit: 'mb/d' };
}

/** A plain year, or the first year of GEM's "2009-2011" ranges. "Before 1990" and blanks give null. */
export function parseYear(raw: string | undefined): number | null {
  const match = /^\s*(\d{4})(?:\s*-\s*\d{4})?\s*$/.exec(raw ?? '');
  return match ? Number(match[1]) : null;
}

/** GEM statuses whose start years are targets, not history. */
const NOT_YET_BUILT = new Set(['proposed', 'construction']);

export function gemHistory(row: GemRow): PipelineHistory | undefined {
  const startYears = [...new Set([row.StartYear1, row.StartYear2, row.StartYear3].flatMap((y) => parseYear(y) ?? []))].sort(
    (a, b) => a - b,
  );
  const proposalYear = parseYear(row.ProposalYear);
  const constructionYear = parseYear(row.ConstructionYear);
  const stopYear = parseYear(row.StopYear);
  if (!startYears.length && proposalYear === null && constructionYear === null && stopYear === null) return undefined;
  return {
    startYears,
    expected: NOT_YET_BUILT.has(row.Status.trim().toLowerCase()),
    ...(proposalYear !== null ? { proposalYear } : {}),
    ...(constructionYear !== null ? { constructionYear } : {}),
    ...(stopYear !== null ? { stopYear } : {}),
  };
}

/** Known length first; GEM's estimate from the mapped route otherwise. "--" means none. */
export function gemLength(row: GemRow): Pipeline['lengthKm'] {
  const known = parseNumber(row.LengthKnownKm);
  if (known !== null) return { value: Math.round(known), estimated: false };
  const estimate = parseNumber(row.LengthEstimateKm);
  return estimate === null ? undefined : { value: Math.round(estimate), estimated: true };
}

/** "30, 42.0" in "in" -> "30, 42 in". No unit, no diameter: a bare number could be either. */
export function gemDiameter(row: GemRow): string | undefined {
  const unit = row.DiameterUnits?.trim();
  const sizes = splitList(row.Diameter, /,/).map((d) => d.replace(/\.0+$/, ''));
  return unit && sizes.length ? `${sizes.join(', ')} ${unit}` : undefined;
}

/**
 * Chains parts that meet end to end (either way round) into longer lines. GEM stores many routes as
 * thousands of two-point pieces, which simplification can't thin; joined, it can. Where three or more
 * parts meet, one continues the chain and the rest start their own.
 */
export function joinLineParts(parts: Position[][]): Position[][] {
  const key = (p: Position) => `${p[0]},${p[1]}`;
  const byEnd = new Map<string, number[]>();
  parts.forEach((part, i) => {
    for (const end of [part[0]!, part[part.length - 1]!]) {
      const k = key(end);
      byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
    }
  });
  const used = new Array<boolean>(parts.length).fill(false);
  // The next unused part touching this point, oriented to start there.
  const next = (point: Position): Position[] | null => {
    const k = key(point);
    const i = byEnd.get(k)?.find((j) => !used[j]);
    if (i === undefined) return null;
    used[i] = true;
    const part = parts[i]!;
    return key(part[0]!) === k ? part : [...part].reverse();
  };
  const joined: Position[][] = [];
  parts.forEach((part, i) => {
    if (used[i]) return;
    used[i] = true;
    const chain = [...part];
    for (let more = next(chain[chain.length - 1]!); more; more = next(chain[chain.length - 1]!)) chain.push(...more.slice(1));
    for (let more = next(chain[0]!); more; more = next(chain[0]!)) chain.unshift(...more.reverse().slice(0, -1));
    joined.push(chain);
  });
  return joined;
}

/** Keeps only line parts, joined where they meet; returns null when nothing drawable is left. */
export function lineGeometry(geometry: Geometry | null): LineString | MultiLineString | null {
  if (!geometry) return null;
  const lines: Position[][] = [];
  const collect = (g: Geometry) => {
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(collect);
  };
  collect(geometry);
  const usable = joinLineParts(lines.filter((l) => l.length >= 2));
  if (usable.length === 0) return null;
  return usable.length === 1
    ? { type: 'LineString', coordinates: usable[0]! }
    : { type: 'MultiLineString', coordinates: usable };
}

const COMPANY_SUFFIXES =
  /\b(pjsc|ojsc|jsc|plc|llc|lp|inc|corp|corporation|co|company|ltd|limited|sa|spa|ag|se|nv|bv|asa|as|ab|oyj|gmbh|group|holdings?)\b/g;

const companyKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(COMPANY_SUFFIXES, '')
    .replace(/\s+/g, '');

/**
 * True when the parents list says nothing the owners list doesn't: the same companies, give or
 * take a legal suffix ("Transneft" and "Transneft PJSC"). Then only the owners are kept.
 */
export function sameCompanies(owners: { name: string }[], parents: { name: string }[]): boolean {
  const keys = (list: { name: string }[]) => [...new Set(list.map((c) => companyKey(c.name)))].sort().join('|');
  return keys(owners) === keys(parents);
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
  const parents = parseOwners(row.Parent);
  const capacity = gemCapacity(row, commodity);
  const history = gemHistory(row);
  const lengthKm = gemLength(row);
  const diameter = gemDiameter(row);
  const start = row.StartLocation?.trim();
  const end = row.EndLocation?.trim();

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
      ...(segment ? { system: row.PipelineName.trim() } : {}),
      commodity,
      fromCountry,
      toCountry,
      transitCountries,
      ...(owners.length ? { owners } : {}),
      ...(parents.length && !sameCompanies(owners, parents) ? { parents } : {}),
      ...(capacity ? { capacity } : {}),
      ...(history ? { history } : {}),
      ...(lengthKm ? { lengthKm } : {}),
      ...(diameter ? { diameter } : {}),
      ...(start || end ? { endpoints: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
      geometry: line,
      // GEM marks rough routes as low accuracy; they render like endpoint-only lines.
      geometryApprox: row.RouteAccuracy.trim().toLowerCase() === 'low',
      evidence: [evidence],
      sources: [ctx.sourceId],
    },
  };
}

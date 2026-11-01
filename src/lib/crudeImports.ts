// "Where is a country's oil from?" (SPEC M10): shares of a country's crude imports by partner, from
// Eurostat, UN Comtrade or EIA, with the chokepoints its cited routes pass. Pure.

import type { CountryCrudeImports, OilRoute, OilTerminal } from '../types';
import type { FilterMatches } from './filters';
import { CRUDE_IMPORTS } from './config';
import type { Datasets } from './data';
import { formatCountry } from './format';
import { exposure, type ChokepointExposure } from './oilOrigins';

export interface ImportRow {
  /** "country/SAU", "unspecified" or "other". */
  key: string;
  kind: 'country' | 'unspecified' | 'other';
  label: string;
  detail: string | null;
  value: number;
  share: number;
  iso2?: string;
  /** ISO alpha-3, as the curated routes are keyed. */
  code?: string;
  /** Terminals the partner's crude can leave from, when a curated route names them. */
  terminals?: OilTerminal[];
}

export interface CountryOrigins {
  record: CountryCrudeImports;
  rows: ImportRow[];
  exposure: ChokepointExposure[];
  routes: OilRoute[];
}

const listOr = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? ''));

/**
 * A country's crude imports as shares of its total, largest first. Partners under minShare fold into
 * "other countries"; what the source doesn't split by country (Comtrade's "Areas, nes", Eurostat's
 * "not specified" and regional remainders) is one row of its own.
 */
export function countryOrigins(
  record: CountryCrudeImports,
  { routes = [], terminals = [], minShare = CRUDE_IMPORTS.minShare }: { routes?: OilRoute[]; terminals?: OilTerminal[]; minShare?: number } = {},
): CountryOrigins {
  const rows: ImportRow[] = [];
  let other = 0;
  let otherCount = 0;
  let unspecified = 0;
  const unspecifiedLabels: string[] = [];
  for (const p of record.partners) {
    if (!p.iso2) {
      unspecified += p.value;
      unspecifiedLabels.push(p.label);
      continue;
    }
    if (p.value / record.total < minShare) {
      other += p.value;
      otherCount += 1;
      continue;
    }
    const route = p.iso3 ? routes.find((r) => r.country === p.iso3) : undefined;
    const routeTerminals = route ? route.terminals.flatMap((id) => terminals.filter((t) => t.id === id)) : [];
    rows.push({
      key: `country/${p.iso3 ?? p.iso2}`,
      kind: 'country',
      label: formatCountry(p.iso2),
      detail: routeTerminals.length ? `Loads at ${listOr(routeTerminals.map((t) => t.name))}` : null,
      value: p.value,
      share: p.value / record.total,
      iso2: p.iso2,
      ...(p.iso3 ? { code: p.iso3 } : {}),
      ...(routeTerminals.length ? { terminals: routeTerminals } : {}),
    });
  }
  rows.sort((a, b) => b.value - a.value);
  if (unspecified > 0)
    rows.push({
      key: 'unspecified',
      kind: 'unspecified',
      label: 'Not named by country',
      detail: `As the source gives it: ${unspecifiedLabels.join(', ')}`,
      value: unspecified,
      share: unspecified / record.total,
    });
  if (other > 0)
    rows.push({
      key: 'other',
      kind: 'other',
      label: `${otherCount} other ${otherCount === 1 ? 'country' : 'countries'}`,
      detail: `Each under ${Math.round(minShare * 100)}%`,
      value: other,
      share: other / record.total,
    });
  return {
    record,
    rows,
    exposure: exposure(rows),
    routes: routes.filter((r) => rows.some((row) => row.code === r.country)),
  };
}

/** Every country with crude import data, largest importer by value first; those Comtrade has no value for go last, by name. */
export function crudeImportList(data: Pick<Datasets, 'crudeImports'>): CountryCrudeImports[] {
  return [...data.crudeImports].sort(
    (a, b) => (b.importsUsd?.value ?? -1) - (a.importsUsd?.value ?? -1) || formatCountry(a.id).localeCompare(formatCountry(b.id)),
  );
}

/** A country's origins with the routes and terminals the data names, or null without import data. */
export function originsOfCountry(data: Pick<Datasets, 'crudeImports' | 'oilRoutes' | 'oilTerminals'>, country: string): CountryOrigins | null {
  const record = data.crudeImports.find((r) => r.id === country);
  return record ? countryOrigins(record, { routes: data.oilRoutes, terminals: data.oilTerminals }) : null;
}

/** "Sep 2025 to Aug 2026" style, as ISO periods: "2025-09 to 2026-08", or the year alone. */
export function importPeriod(record: Pick<CountryCrudeImports, 'from' | 'to'>): string {
  return record.from === record.to ? record.from : `${record.from} to ${record.to}`;
}

/** What the oil origins surface keeps bright: the terminals on cited routes from any listed country's partners, and the chokepoints they pass. */
export function importsSurfaceHighlight(data: Pick<Datasets, 'crudeImports' | 'oilRoutes' | 'oilTerminals'>): FilterMatches {
  const partners = new Set(data.crudeImports.flatMap((r) => r.partners.flatMap((p) => (p.iso3 ? [p.iso3] : []))));
  const ids = new Set(data.oilRoutes.filter((r) => partners.has(r.country)).flatMap((r) => r.terminals));
  const terminals = data.oilTerminals.filter((t) => ids.has(t.id));
  return {
    pipelines: new Set(),
    chokepoints: new Set(terminals.flatMap((t) => t.exitVia as string[])),
    lng: new Set(),
    terminals: new Set(terminals.map((t) => t.id)),
  };
}

/** What an open country keeps bright on the map: the chokepoints and terminals on its cited routes. */
export function countryHighlight(origins: CountryOrigins | null): FilterMatches {
  return {
    pipelines: new Set(),
    chokepoints: new Set(origins?.exposure.map((e) => e.chokepoint) ?? []),
    lng: new Set(),
    terminals: new Set(origins?.rows.flatMap((r) => r.terminals?.map((t) => t.id) ?? []) ?? []),
  };
}

/** Schematic arcs from each partner's label point to the importing country's. They show where, not how. */
export function countryArcs(origins: CountryOrigins, points: Record<string, [number, number]>): { key: string; from: [number, number]; to: [number, number]; share: number; kind: 'country' }[] {
  const to = origins.record.iso3 ? points[origins.record.iso3] : undefined;
  if (!to) return [];
  return origins.rows.flatMap((row) => {
    const from = row.kind === 'country' && row.code ? points[row.code] : undefined;
    return from ? [{ key: row.key, from, to, share: row.share, kind: 'country' as const }] : [];
  });
}

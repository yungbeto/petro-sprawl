// "Where is my oil from?" (SPEC M6): shares of the crude flowing into one PADD, from EIA monthly data.
// Pure; the panel and the map read the result.

import type { ChokepointId, OilOriginRegion, OilRoute, OilTerminal, PaddRef, UsLookup } from '../types';
import { EIA, PADDS } from './config';

export interface OriginRow {
  /** "country/SAU", "region/padd-2", "own", "ethanol" or "other". */
  key: string;
  /** "ethanol" is fuel ethanol blended into a region's gasoline (M7). */
  kind: 'country' | 'region' | 'own' | 'ethanol' | 'other';
  label: string;
  /** How it arrives or where it's pumped, when EIA or a curated route says. */
  detail: string | null;
  kbbl: number;
  share: number;
  code?: string;
  padd?: PaddRef;
  /** Terminals the country's crude can leave from, when a curated route names them. */
  terminals?: OilTerminal[];
}

export interface ChokepointExposure {
  chokepoint: ChokepointId;
  share: number;
  /** False when some of the crude can avoid it (another terminal, another way out): the share is an upper bound. */
  certain: boolean;
  countries: string[];
}

export interface RegionOrigins {
  from: string;
  to: string;
  months: number;
  /** Barrels a day flowing in or pumped, over the window. */
  barrelsPerDay: number;
  refineryInputPerDay: number;
  rows: OriginRow[];
  exposure: ChokepointExposure[];
  routes: OilRoute[];
}

export const daysInMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};

export const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** "Texas (56%), New Mexico (23%) and federal offshore, Gulf of America (20%)": the biggest few, in order. */
function areaList(areas: { name: string; kbbl: number }[], total: number, max = 3): string {
  const parts = areas.slice(0, max).map((a) => `${a.name} (${pct(a.kbbl, total)})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
}

export function sumBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + value(item));
  return out;
}

export const MODES = [
  ['pipeline', 'pipeline'],
  ['tankerBarge', 'tanker and barge'],
  ['rail', 'rail'],
] as const;

/**
 * Crude flowing into a PADD over its last `windowMonths` months: imports by country, receipts from
 * other PADDs and field production in the region, each as a share of their sum. Some of it moves on
 * to other regions or abroad, so this describes what comes in, not exactly what is refined there.
 */
export function regionOrigins(
  region: OilOriginRegion,
  { routes = [], terminals = [], windowMonths = EIA.windowMonths, minShare = EIA.minShare }: {
    routes?: OilRoute[];
    terminals?: OilTerminal[];
    windowMonths?: number;
    minShare?: number;
  } = {},
): RegionOrigins | null {
  const months = region.months.slice(-windowMonths);
  if (months.length < windowMonths) return null;
  const days = months.reduce((a, m) => a + daysInMonth(m.period), 0);

  const imports = months.flatMap((m) => m.imports);
  const names = new Map(imports.map((i) => [i.code, i.name]));
  const byCountry = [...sumBy(imports, (i) => i.code, (i) => i.kbbl)].sort((a, b) => b[1] - a[1]);
  const receipts = months.flatMap((m) => m.receipts);
  const byRegion = [...sumBy(receipts, (r) => r.from, (r) => r.kbbl)].sort((a, b) => b[1] - a[1]);
  const production = months.flatMap((m) => m.production);
  const byArea = [...sumBy(production, (p) => p.area, (p) => p.kbbl)].sort((a, b) => b[1] - a[1]);
  const own = byArea.reduce((a, [, v]) => a + v, 0);

  const total = byCountry.reduce((a, [, v]) => a + v, 0) + byRegion.reduce((a, [, v]) => a + v, 0) + own;
  if (total <= 0) return null;

  const rows: OriginRow[] = [];
  let otherKbbl = 0;
  let otherCount = 0;
  let unnamed = false;
  for (const [code, kbbl] of byCountry) {
    if (kbbl / total < minShare || code === EIA.unnamedPartner) {
      otherKbbl += kbbl;
      if (code === EIA.unnamedPartner) unnamed = true;
      else otherCount += 1;
      continue;
    }
    const route = routes.find((r) => r.country === code);
    const routeTerminals = route ? route.terminals.flatMap((id) => terminals.filter((t) => t.id === id)) : undefined;
    rows.push({
      key: `country/${code}`,
      kind: 'country',
      label: names.get(code) ?? code,
      detail: routeTerminals?.length ? `Loads at ${listOr(routeTerminals.map((t) => t.name))}` : null,
      kbbl,
      share: kbbl / total,
      code,
      ...(routeTerminals?.length ? { terminals: routeTerminals } : {}),
    });
  }
  for (const [from, kbbl] of byRegion) {
    const mine = receipts.filter((r) => r.from === from);
    const modes = MODES.map(([key, label]) => [label, mine.reduce((a, r) => a + r[key], 0)] as const).sort((a, b) => b[1] - a[1]);
    const [mainLabel, main] = modes[0]!;
    rows.push({
      key: `region/${from}`,
      kind: 'region',
      label: PADDS.find((p) => p.id === from)?.name ?? from,
      detail: main > 0 ? `Mostly by ${mainLabel} (${pct(main, kbbl)})` : null,
      kbbl,
      share: kbbl / total,
      padd: from as PaddRef,
    });
  }
  if (own > 0) {
    rows.push({
      key: 'own',
      kind: 'own',
      label: 'Pumped in the region',
      detail: areaList(byArea.map(([name, kbbl]) => ({ name, kbbl })), own),
      kbbl: own,
      share: own / total,
    });
  }
  rows.sort((a, b) => b.kbbl - a.kbbl);
  if (otherKbbl > 0) {
    rows.push({
      key: 'other',
      kind: 'other',
      label: otherCount ? `${otherCount} other ${otherCount === 1 ? 'country' : 'countries'}` : 'Other countries',
      detail: [otherCount && `Each under ${Math.round(minShare * 100)}%`, unnamed && 'some EIA does not name']
        .filter(Boolean)
        .join(', ')
        .replace(/^s/, 'S'),
      kbbl: otherKbbl,
      share: otherKbbl / total,
    });
  }

  return {
    from: months[0]!.period,
    to: months.at(-1)!.period,
    months: months.length,
    barrelsPerDay: (total * 1000) / days,
    refineryInputPerDay: (months.reduce((a, m) => a + m.refineryInput, 0) * 1000) / days,
    rows,
    exposure: exposure(rows),
    routes: routes.filter((r) => rows.some((row) => row.code === r.country)),
  };
}

function listOr(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? '');
}

/**
 * The share of the region's crude whose country's terminals ship through each chokepoint. Certain
 * only when every terminal the country can load at passes it; otherwise it's an upper bound.
 */
export function exposure(rows: OriginRow[]): ChokepointExposure[] {
  const out = new Map<ChokepointId, ChokepointExposure>();
  for (const row of rows) {
    if (!row.terminals?.length) continue;
    const via = new Set(row.terminals.flatMap((t) => t.exitVia));
    for (const chokepoint of via) {
      const always = row.terminals.every((t) => t.exitVia.includes(chokepoint));
      const entry = out.get(chokepoint) ?? { chokepoint, share: 0, certain: true, countries: [] };
      entry.share += row.share;
      entry.certain &&= always;
      entry.countries.push(row.label);
      out.set(chokepoint, entry);
    }
  }
  return [...out.values()].sort((a, b) => b.share - a.share);
}

/** The PADD a state belongs to, by EIA's definition. */
export function paddForState(state: string): PaddRef | null {
  const lower = state.toLowerCase();
  return PADDS.find((p) => p.states.some((s) => s.toLowerCase() === lower))?.id ?? null;
}

/**
 * The state a ZIP code is in, from the ZCTA ranges. A ZIP code that isn't a ZCTA (PO boxes and some
 * business codes) is placed only when the ZCTAs either side are in the same state.
 */
export function stateForZip(lookup: Pick<UsLookup, 'states' | 'zipRanges'>, zip: string): string | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const n = Number(zip);
  const ranges = lookup.zipRanges;
  let lo = 0;
  let hi = ranges.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid]![0] <= n) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (at < 0) return null;
  const [, last, state] = ranges[at]!;
  if (n <= last) return lookup.states[state] ?? null;
  return null;
}

export interface OriginArc {
  key: string;
  from: [number, number];
  to: [number, number];
  share: number;
  kind: 'country' | 'region';
}

/**
 * Schematic arcs into the region: from each country's label point, or another region's hub, to this
 * region's hub. They show where crude comes from, not the path a tanker or pipeline takes.
 */
export function originArcs(origins: Pick<RegionOrigins, 'rows'>, regionId: PaddRef, lookup: Pick<UsLookup, 'hubs' | 'countryPoints'>): OriginArc[] {
  const to = lookup.hubs[regionId];
  if (!to) return [];
  return origins.rows.flatMap((row): OriginArc[] => {
    const from = row.kind === 'country' && row.code ? lookup.countryPoints[row.code] : row.kind === 'region' && row.padd ? lookup.hubs[row.padd] : undefined;
    return from ? [{ key: row.key, from, to, share: row.share, kind: row.kind as 'country' | 'region' }] : [];
  });
}

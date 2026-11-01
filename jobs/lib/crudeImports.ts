// Crude imports by partner country (SPEC M10): Eurostat monthly for the countries it reports, UN Comtrade
// annual for the other largest importers, and EIA for the United States. Each becomes one record of a
// country's partners over its latest window; the browser turns them into shares.

import { z } from 'zod';
import { COMTRADE, CRUDE_IMPORTS, EUROSTAT_OIL } from '../../src/lib/config';
import type { CountryCrudeImports, OilOriginRegion } from '../../src/types';

type Partner = CountryCrudeImports['partners'][number];

/** "2026-08" moved by n months. */
export function addMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Country codes both ways, from Comtrade's partner reference (which covers every ISO country). */
export interface CountryCodes {
  iso3: Map<string, string>;
  iso2: Map<string, string>;
}

export const comtradeAreaSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int(),
      text: z.string(),
      PartnerCodeIsoAlpha2: z.string().optional(),
      PartnerCodeIsoAlpha3: z.string().optional(),
      reporterCodeIsoAlpha2: z.string().optional(),
      reporterCodeIsoAlpha3: z.string().optional(),
      isGroup: z.boolean(),
    }),
  ),
});
export type ComtradeAreas = z.infer<typeof comtradeAreaSchema>['results'];

const isIso2 = (code: string | undefined): code is string => !!code && /^[A-Z]{2}$/.test(code);
const isIso3 = (code: string | undefined): code is string => !!code && /^[A-Z]{3}$/.test(code);

export function countryCodes(partners: ComtradeAreas): CountryCodes {
  const iso3 = new Map<string, string>();
  const iso2 = new Map<string, string>();
  for (const p of partners) {
    if (p.isGroup || !isIso2(p.PartnerCodeIsoAlpha2) || !isIso3(p.PartnerCodeIsoAlpha3)) continue;
    iso3.set(p.PartnerCodeIsoAlpha2, p.PartnerCodeIsoAlpha3);
    iso2.set(p.PartnerCodeIsoAlpha3, p.PartnerCodeIsoAlpha2);
  }
  return { iso3, iso2 };
}

const byValue = (a: Partner, b: Partner) => b.value - a.value;

// Eurostat

/** The JSON-stat 2.0 response: dimensions in `id` order, values keyed by flat index. */
export const jsonStatSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number().int()),
  value: z.record(z.string(), z.number()),
  dimension: z.record(
    z.string(),
    z.object({ category: z.object({ index: z.record(z.string(), z.number().int()), label: z.record(z.string(), z.string()).optional() }) }),
  ),
});
export type JsonStat = z.infer<typeof jsonStatSchema>;

/** A reader for one cell by category code in every dimension. */
function cells(body: JsonStat) {
  const strides = body.size.map((_, i) => body.size.slice(i + 1).reduce((a, b) => a * b, 1));
  return (coords: Record<string, string>): number | undefined => {
    let flat = 0;
    for (const [i, dim] of body.id.entries()) {
      const index = body.dimension[dim]?.category.index[coords[dim] ?? ''];
      if (index === undefined) return undefined;
      flat += index * (strides[i] ?? 1);
    }
    return body.value[String(flat)];
  };
}

/**
 * Each reporter's crude imports over the 12 months ending with its latest reported total. Reporters with
 * no total since `sinceMonth` are left out (the UK stopped reporting after leaving the EU).
 */
export function eurostatImports(
  body: JsonStat,
  { codes, sinceMonth, retrieved }: { codes: CountryCodes; sinceMonth: string; retrieved: string },
): CountryCrudeImports[] {
  const get = cells(body);
  const categories = (dim: string) => Object.keys(body.dimension[dim]?.category.index ?? {});
  const labels = body.dimension.partner?.category.label ?? {};
  const months = categories('time').sort();
  const fixed = { freq: 'M', siec: EUROSTAT_OIL.siec, unit: EUROSTAT_OIL.unit };
  const aggregates = new Set<string>(EUROSTAT_OIL.aggregates);
  const iso2Of = (code: string) => EUROSTAT_OIL.iso2[code] ?? (isIso2(code) ? code : null);
  const out: CountryCrudeImports[] = [];
  for (const geo of categories('geo')) {
    const id = iso2Of(geo);
    if (aggregates.has(geo) || !id) continue;
    const total = (time: string) => get({ ...fixed, geo, time, partner: 'TOTAL' });
    const latest = months.filter((m) => (total(m) ?? 0) > 0).at(-1);
    if (!latest || latest < sinceMonth) continue;
    const from = addMonths(latest, -(CRUDE_IMPORTS.windowMonths - 1));
    const window = months.filter((m) => m >= from && m <= latest && total(m) !== undefined);
    const sum = window.reduce((a, m) => a + (total(m) ?? 0), 0);
    if (sum <= 0) continue;
    const partners: Partner[] = [];
    for (const partner of categories('partner')) {
      if (aggregates.has(partner)) continue;
      const value = window.reduce((a, m) => a + (get({ ...fixed, geo, time: m, partner }) ?? 0), 0);
      if (value <= 0) continue;
      const iso2 = iso2Of(partner);
      partners.push({ iso2, iso3: iso2 ? (codes.iso3.get(iso2) ?? null) : null, label: labels[partner] ?? partner, value });
    }
    if (!partners.length) continue;
    out.push({
      id,
      iso3: codes.iso3.get(id) ?? null,
      source: 'eurostat',
      basis: 'weight',
      unit: 'thousand tonnes',
      from,
      to: latest,
      monthsReported: window.length,
      total: sum,
      partners: partners.sort(byValue),
      importsUsd: null,
      retrieved,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// UN Comtrade

export const comtradeRowSchema = z.object({
  period: z.string(),
  reporterCode: z.number().int(),
  partnerCode: z.number().int(),
  partner2Code: z.number().int(),
  customsCode: z.string(),
  motCode: z.number().int(),
  netWgt: z.number().nullable(),
  primaryValue: z.number().nullable(),
});
export type ComtradeRow = z.infer<typeof comtradeRowSchema>;

/** Totals over every customs procedure, mode of transport and second partner: the rows worth reading. */
const totals = (rows: ComtradeRow[]) => rows.filter((r) => r.customsCode === 'C00' && r.motCode === 0 && r.partner2Code === 0);

/**
 * Each reporter's crude imports from the world in its latest year, by value, keyed by ISO alpha-2.
 * Rows from more than one year: the later year wins.
 */
export function importersByValue(rows: ComtradeRow[], reporters: ComtradeAreas): Map<string, { year: string; value: number; code: number }> {
  const iso = new Map(reporters.flatMap((r) => (isIso2(r.reporterCodeIsoAlpha2) && !r.isGroup ? [[r.id, r.reporterCodeIsoAlpha2] as const] : [])));
  const out = new Map<string, { year: string; value: number; code: number }>();
  for (const row of totals(rows)) {
    const id = iso.get(row.reporterCode);
    if (!id || row.partnerCode !== 0 || !row.primaryValue || row.primaryValue <= 0) continue;
    const seen = out.get(id);
    if (!seen || row.period > seen.year) out.set(id, { year: row.period, value: row.primaryValue, code: row.reporterCode });
  }
  return out;
}

/** The `largest` importers by value, largest first. */
export function largestImporters(byValue: Map<string, { value: number }>, largest: number = CRUDE_IMPORTS.largest): string[] {
  return [...byValue].sort((a, b) => b[1].value - a[1].value).slice(0, largest).map(([id]) => id);
}

/**
 * One reporter's partners in one year. By net weight in tonnes when the partners with a weight hold at
 * least COMTRADE.minWeightCoverage of the value; by value in US$ otherwise.
 */
export function comtradeImports(
  id: string,
  rows: ComtradeRow[],
  {
    partners: areas,
    importsUsd,
    iso3,
    retrieved,
  }: { partners: ComtradeAreas; importsUsd: CountryCrudeImports['importsUsd']; iso3: string | null; retrieved: string },
): CountryCrudeImports | null {
  const byCode = new Map(areas.map((a) => [a.id, a]));
  const mine = totals(rows).filter((r) => r.partnerCode !== 0 && !byCode.get(r.partnerCode)?.isGroup && (r.primaryValue ?? 0) > 0);
  if (!mine.length) return null;
  const year = mine.map((r) => r.period).sort().at(-1)!;
  const inYear = mine.filter((r) => r.period === year);
  const value = inYear.reduce((a, r) => a + (r.primaryValue ?? 0), 0);
  const weighed = inYear.filter((r) => (r.netWgt ?? 0) > 0);
  const byWeight = weighed.reduce((a, r) => a + (r.primaryValue ?? 0), 0) / value >= COMTRADE.minWeightCoverage;
  const partners: Partner[] = (byWeight ? weighed : inYear).map((r) => {
    const area = byCode.get(r.partnerCode);
    const iso2 = isIso2(area?.PartnerCodeIsoAlpha2) ? area.PartnerCodeIsoAlpha2 : null;
    const iso3 = iso2 && isIso3(area?.PartnerCodeIsoAlpha3) ? area.PartnerCodeIsoAlpha3 : null;
    return { iso2, iso3, label: area?.text ?? `Partner ${r.partnerCode}`, value: byWeight ? r.netWgt! / 1000 : r.primaryValue! };
  });
  const total = partners.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return null;
  return {
    id,
    iso3,
    source: 'comtrade',
    basis: byWeight ? 'weight' : 'value',
    unit: byWeight ? 'tonnes' : 'US$',
    from: year,
    to: year,
    monthsReported: null,
    total,
    partners: partners.sort(byValue),
    importsUsd,
    retrieved,
  };
}

// EIA, for the United States

/** The US as one country: imports by country across the five PADDs over the latest 12 months. */
export function eiaImports(
  regions: OilOriginRegion[],
  { codes, importsUsd, retrieved }: { codes: CountryCodes; importsUsd: CountryCrudeImports['importsUsd']; retrieved: string },
): CountryCrudeImports | null {
  const periods = [...new Set(regions.flatMap((r) => r.months.map((m) => m.period)))].sort();
  const window = periods.slice(-CRUDE_IMPORTS.windowMonths);
  if (window.length < CRUDE_IMPORTS.windowMonths) return null;
  const sums = new Map<string, { name: string; kbbl: number }>();
  for (const region of regions)
    for (const month of region.months)
      if (window.includes(month.period))
        for (const i of month.imports) {
          const entry = sums.get(i.code) ?? { name: i.name, kbbl: 0 };
          entry.kbbl += i.kbbl;
          sums.set(i.code, entry);
        }
  const partners: Partner[] = [...sums].flatMap(([code, { name, kbbl }]) => {
    if (kbbl <= 0) return [];
    const iso2 = codes.iso2.get(code) ?? null;
    return [{ iso2, iso3: iso2 ? code : null, label: name, value: kbbl }];
  });
  const total = partners.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return null;
  return {
    id: 'US',
    iso3: 'USA',
    source: 'eia',
    basis: 'weight',
    unit: 'thousand barrels',
    from: window[0]!,
    to: window.at(-1)!,
    monthsReported: window.length,
    total,
    partners: partners.sort(byValue),
    importsUsd,
    retrieved,
  };
}
